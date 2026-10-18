import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToB64url, b64urlToBytes } from "../../src/unlock/codec.js";
import { buildPayload, canonicalPayload, importPrivateKey, signPayload } from "../../src/unlock/sign.js";
import { PUBLIC_KEY } from "../../src/unlock/public-key.js";
import { verifyCode, verifySignedCode } from "../../src/unlock/verify.js";
import { verifyLemonSqueezyLicense } from "../../src/unlock/lemonsqueezy.js";
import { ledgerCsv, parseLedger } from "../../src/unlock/ledger.js";
import { loadUnlock, saveUnlock } from "../../src/unlock/storage.js";
import { TEST_KEY_X, deploymentBlockReason } from "../../tools/assert-production-key.mjs";
import { ownerKeyMismatch } from "../../tools/make-owner-code.mjs";

const privateJwk = JSON.parse(
  readFileSync(new URL("../fixtures/TEST_DEV_PRIVATE_KEY.json", import.meta.url), "utf8"),
);

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
    const ok = await verifySignedCode(code, { publicKey: PUBLIC_KEY });
    expect(ok.ok).toBe(true);
    expect(ok.payload.n).toBe("Sarah");
    expect(ok.payload.id).toBe(payload.id);

    const [body, signature] = code.split(".");
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    parsed.n = "SaraX";
    const tamperedBody = `${bytesToB64url(new TextEncoder().encode(JSON.stringify(canonicalPayload(parsed))))}.${signature}`;
    expect((await verifySignedCode(tamperedBody, { publicKey: PUBLIC_KEY })).reason).toBe("signature");
    const tamperedSig = `${body}.${signature.slice(0, -2)}aa`;
    expect((await verifySignedCode(tamperedSig, { publicKey: PUBLIC_KEY })).reason).toBe("signature");

    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const otherJwk = await crypto.subtle.exportKey("jwk", other.privateKey);
    const wrong = await signed({}, await importPrivateKey(otherJwk));
    expect((await verifySignedCode(wrong.code, { publicKey: PUBLIC_KEY })).reason).toBe("signature");

    const future = await signed();
    const futurePayload = { ...future.payload, v: 2 };
    const futureCode = await signPayload(await importPrivateKey(privateJwk), futurePayload);
    expect((await verifySignedCode(futureCode, { publicKey: PUBLIC_KEY })).reason).toBe("version");
    const missingId = await signPayload(await importPrivateKey(privateJwk), { ...payload, id: 12 });
    expect((await verifySignedCode(missingId, { publicKey: PUBLIC_KEY })).reason).toBe("garbage");
    const blankId = await signPayload(await importPrivateKey(privateJwk), { ...payload, id: "  " });
    expect((await verifySignedCode(blankId, { publicKey: PUBLIC_KEY })).reason).toBe("garbage");
    expect((await verifySignedCode(code, { publicKey: PUBLIC_KEY, revokedIds: ["RW-7K3D9Q"] })).reason).toBe("revoked");

    for (const bad of ["", "   ", "hello", "@@@.@@@", "a.b.c", "..."]) {
      const result = await verifyCode(bad, { publicKey: PUBLIC_KEY });
      expect(result.ok).toBe(false);
    }
    expect((await verifyCode("LS-LICENSE", { publicKey: PUBLIC_KEY })).reason).toBe("not-configured");
  });

  it("does not call a payment processor", async () => {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network");
    };
    try {
      const result = await verifyLemonSqueezyLicense("license");
      expect(result).toEqual({ ok: false, reason: "not-configured" });
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

  it("mints an owner code from the private key file", async () => {
    const out = execFileSync("node", [
      "tools/make-owner-code.mjs",
      "tests/fixtures/TEST_DEV_PRIVATE_KEY.json",
      "Matthew",
      "owner",
    ], { encoding: "utf8" });
    const code = out.trim().split("\n").pop();
    const result = await verifySignedCode(code, { publicKey: PUBLIC_KEY });
    expect(result.ok).toBe(true);
    expect(result.payload.tier).toBe("owner");
    expect(result.payload.n).toBe("Matthew");
    expect(result.payload.o).toBe("owner");
  });

  it("refuses a private key that does not match the committed public key", () => {
    expect(ownerKeyMismatch(privateJwk)).toBe("");
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
  });

  it("publishes a test public key with no private material", () => {
    expect(PUBLIC_KEY.d).toBeUndefined();
    expect(privateJwk._warning).toMatch(/TEST\/DEV/i);
    expect(privateJwk.x).toBe(PUBLIC_KEY.x);
  });
});
