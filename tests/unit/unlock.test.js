import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToB64url, b64urlToBytes } from "../../src/unlock/codec.js";
import { buildPayload, canonicalPayload, importPrivateKey, signPayload } from "../../src/unlock/sign.js";
import { KEY_STATUS, PUBLIC_KEY, verificationKey } from "../../src/unlock/public-key.js";
import { verifyCode, verifySignedCode } from "../../src/unlock/verify.js";
import { verifyLemonSqueezyLicense } from "../../src/unlock/lemonsqueezy.js";
import { ledgerCsv, parseLedger } from "../../src/unlock/ledger.js";
import { loadUnlock, saveUnlock } from "../../src/unlock/storage.js";
import {
  TEST_CHECKOUT_ID,
  TEST_KEY_D,
  TEST_KEY_X,
  TEST_PRODUCT_ID,
  TEST_STORE_ID,
  TEST_VARIANT_ID,
  deploymentBlockReason,
  distBlockReason,
  liveModeBlockReason,
} from "../../tools/assert-production-key.mjs";
import { ownerCodeFromPrivateJwk, ownerKeyMismatch } from "../../tools/make-owner-code.mjs";

const privateJwk = JSON.parse(
  readFileSync(new URL("../fixtures/TEST_DEV_PRIVATE_KEY.json", import.meta.url), "utf8"),
);
const testPublicKey = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  ext: true,
  key_ops: ["verify"],
  x: privateJwk.x,
  y: privateJwk.y,
};

async function signed(overrides = {}, key = null) {
  const privateKey = key || (await importPrivateKey(privateJwk));
  const payload = buildPayload({
    tier: "pro",
    name: "Sarah",
    order: "3456789012",
    id: "RW-7K3D9Q",
    date: "2026-11-02",
    ...overrides,
  });
  return { code: await signPayload(privateKey, payload), payload };
}

describe("verify", () => {
  it("accepts a valid code and rejects tampering, the wrong key, and garbage", async () => {
    const { code, payload } = await signed();
    const ok = await verifySignedCode(code, { publicKey: testPublicKey });
    expect((await verifySignedCode(code, { publicKey: PUBLIC_KEY })).reason).toBe("signature");
    expect(ok.ok).toBe(true);
    expect(ok.payload.n).toBe("Sarah");
    expect(ok.payload.id).toBe(payload.id);

    const [body, signature] = code.split(".");
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    parsed.n = "SaraX";
    const tamperedBody = `${bytesToB64url(new TextEncoder().encode(JSON.stringify(canonicalPayload(parsed))))}.${signature}`;
    expect((await verifySignedCode(tamperedBody, { publicKey: testPublicKey })).reason).toBe("signature");
    const tamperedSig = `${body}.${signature.slice(0, -2)}aa`;
    expect((await verifySignedCode(tamperedSig, { publicKey: testPublicKey })).reason).toBe("signature");

    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const otherJwk = await crypto.subtle.exportKey("jwk", other.privateKey);
    const wrong = await signed({}, await importPrivateKey(otherJwk));
    expect((await verifySignedCode(wrong.code, { publicKey: testPublicKey })).reason).toBe("signature");

    const future = await signed();
    const futurePayload = { ...future.payload, v: 2 };
    const futureCode = await signPayload(await importPrivateKey(privateJwk), futurePayload);
    expect((await verifySignedCode(futureCode, { publicKey: testPublicKey })).reason).toBe("version");
    const missingId = await signPayload(await importPrivateKey(privateJwk), { ...payload, id: 12 });
    expect((await verifySignedCode(missingId, { publicKey: testPublicKey })).reason).toBe("garbage");
    const blankId = await signPayload(await importPrivateKey(privateJwk), { ...payload, id: "  " });
    expect((await verifySignedCode(blankId, { publicKey: testPublicKey })).reason).toBe("garbage");
    expect((await verifySignedCode(code, { publicKey: testPublicKey, revokedIds: ["RW-7K3D9Q"] })).reason).toBe("revoked");

    for (const bad of ["", "   ", "hello", "@@@.@@@", "a.b.c", "..."]) {
      const result = await verifyCode(bad, { publicKey: testPublicKey });
      expect(result.ok).toBe(false);
    }
    expect((await verifyCode("LS-LICENSE", { publicKey: testPublicKey })).reason).toBe("not-configured");
  });

  it("does not call the license API for a signed code or a non-key", async () => {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network");
    };
    try {
      const result = await verifyLemonSqueezyLicense("license");
      expect(result).toEqual({ ok: false, reason: "lemon-invalid" });
      const { code } = await signed();
      expect((await verifyCode(code, {
        publicKey: testPublicKey,
        externalVerify: verifyLemonSqueezyLicense,
      })).ok).toBe(true);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("writes a ledger without an email column", () => {
    const csv = ledgerCsv([{ date: "2026-11-02", id: "RW-7K3D9Q", order: "3456789012", name: "Sarah" }]);
    expect(csv.startsWith("date,code_id,order_number,first_name\n")).toBe(true);
    expect(csv).toContain('"2026-11-02","RW-7K3D9Q","3456789012","Sarah"');
    expect(csv.toLowerCase()).not.toContain("email");
    const risky = ledgerCsv([{ date: "2026-11-02", id: "@RW", order: "=1+1", name: "+Sarah" }]);
    expect(risky).toContain("\"'=1+1\"");
    expect(risky).toContain("\"'+Sarah\"");
    expect(risky).toContain("\"'@RW\"");
    expect(parseLedger(risky)[0]).toMatchObject({ id: "@RW", order: "=1+1", name: "+Sarah" });
  });

  it("keeps owner and pro unlocks in separate slots", () => {
    const memory = new Map();
    globalThis.localStorage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };
    saveUnlock({ code: "pro-code" }, "pro");
    saveUnlock({ code: "owner-code" }, "owner");
    expect(loadUnlock("pro").code).toBe("pro-code");
    expect(loadUnlock("owner").code).toBe("owner-code");
    expect(memory.has("rwb-unlock")).toBe(false);
  });

  it("mints an owner code from the test private key when the test public key is passed", async () => {
    const minted = await ownerCodeFromPrivateJwk(privateJwk, { name: "Matthew", order: "owner" });
    const result = await verifySignedCode(minted.code, { publicKey: testPublicKey });
    expect(result.ok).toBe(true);
    expect(result.payload.tier).toBe("owner");
    expect(result.payload.n).toBe("Matthew");
    expect(result.payload.o).toBe("owner");
    expect((await verifySignedCode(minted.code, { publicKey: PUBLIC_KEY })).reason).toBe("signature");
    let failed = false;
    try {
      execFileSync("node", [
        "tools/make-owner-code.mjs",
        "tests/fixtures/TEST_DEV_PRIVATE_KEY.json",
        "Matthew",
        "owner",
      ], { encoding: "utf8" });
    } catch (error) {
      failed = true;
      expect(error.status).toBe(1);
      expect(String(error.stderr)).toMatch(/does not match the public key/);
    }
    expect(failed).toBe(true);
  });

  it("refuses a private key that does not match the committed public key", () => {
    expect(ownerKeyMismatch(privateJwk, testPublicKey)).toBe("");
    expect(ownerKeyMismatch(privateJwk)).toMatch(/does not match/);
    expect(ownerKeyMismatch({ ...privateJwk, x: PUBLIC_KEY.x, y: PUBLIC_KEY.y })).toBe("");
    expect(ownerKeyMismatch({ ...privateJwk, x: "not-the-committed-key" })).toMatch(/does not match/);
    const dir = mkdtempSync(join(tmpdir(), "rwb-key-"));
    const file = join(dir, "wrong.jwk");
    writeFileSync(file, JSON.stringify({ ...privateJwk, y: "not-the-committed-key" }));
    let failed = false;
    try {
      execFileSync("node", ["tools/make-owner-code.mjs", file, "Matthew", "owner"], { encoding: "utf8" });
    } catch (error) {
      failed = true;
      expect(error.status).toBe(1);
      expect(String(error.stderr)).toMatch(/does not match the public key/);
    }
    expect(failed).toBe(true);
  });

  it("refuses to deploy the test key", () => {
    expect(deploymentBlockReason("test-dev", { x: "other" })).toMatch(/production/);
    expect(deploymentBlockReason("production", { x: TEST_KEY_X })).toMatch(/TEST\/DEV/);
    expect(deploymentBlockReason("production", { x: "a-real-key", d: "secret" })).toMatch(/private/);
    expect(deploymentBlockReason("production", { x: "a-real-key" })).toBe("");
    const live = {
      purchaseUrl: "https://example.test/checkout/buy/live",
      lemonSqueezy: { mode: "live", storeId: 1, productId: 2, variantIds: [3] },
    };
    expect(liveModeBlockReason(live, "mode: \"live\"")).toBe("");
    expect(liveModeBlockReason({
      ...live,
      lemonSqueezy: { ...live.lemonSqueezy, storeId: TEST_STORE_ID, productId: TEST_PRODUCT_ID, variantIds: [TEST_VARIANT_ID] },
    }, "")).toMatch(/test store id/);
    expect(liveModeBlockReason(live, `checkout ${TEST_CHECKOUT_ID}`)).toMatch(/test checkout URL/);
    expect(liveModeBlockReason({ ...live, lemonSqueezy: { ...live.lemonSqueezy, mode: "test" } }, TEST_CHECKOUT_ID)).toBe("");
    expect(distBlockReason("var app = {}")).toMatch(/test_mode/);
    expect(distBlockReason("license_key.test_mode")).toBe("");
    expect(distBlockReason(`license_key.test_mode ${TEST_KEY_X}`)).toMatch(/test public key/);
    expect(distBlockReason(`license_key.test_mode ${TEST_KEY_D}`)).toMatch(/test private key/);
    expect(distBlockReason("license_key.test_mode __RWB_TEST_PUBLIC_KEY")).toMatch(/dev test-key hook/);
    expect(deploymentBlockReason(KEY_STATUS, PUBLIC_KEY)).toBe("");
    expect(distBlockReason(`buy/${TEST_CHECKOUT_ID}`)).toMatch(/test checkout URL/);
    expect(distBlockReason("lstest")).toMatch(/lstest/);
    expect(liveModeBlockReason({
      purchaseUrl: "",
      lemonSqueezy: { mode: "test", storeId: TEST_STORE_ID, productId: TEST_PRODUCT_ID, variantIds: [TEST_VARIANT_ID] },
    }, "")).toBe("");
  });

  it("publishes the production public key and keeps the test private key separate", () => {
    expect(KEY_STATUS).toBe("production");
    expect(PUBLIC_KEY.d).toBeUndefined();
    expect(PUBLIC_KEY.key_ops).toEqual(["verify"]);
    expect(PUBLIC_KEY.x).toBe("xJIUJsnBTcXwoo9qbSHbY6ALH-t_jC3JYc3NxkQVrsU");
    expect(PUBLIC_KEY.y).toBe("X0wp34CTfiNh3XNhMbyz_pay1a8VG_LHcfmzhRy_AXQ");
    expect(PUBLIC_KEY.x).not.toBe(TEST_KEY_X);
    expect(privateJwk.x).toBe(TEST_KEY_X);
    expect(privateJwk.d).toBe(TEST_KEY_D);
    expect(privateJwk._warning).toMatch(/TEST\/DEV/i);
    expect(verificationKey()).toEqual(PUBLIC_KEY);
    globalThis.__RWB_TEST_PUBLIC_KEY = { ...testPublicKey, d: privateJwk.d };
    try {
      expect(verificationKey()).toEqual(testPublicKey);
      expect(verificationKey().d).toBeUndefined();
    } finally {
      delete globalThis.__RWB_TEST_PUBLIC_KEY;
    }
  });
});
