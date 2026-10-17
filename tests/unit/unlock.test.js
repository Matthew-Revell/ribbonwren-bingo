import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bytesToB64url, b64urlToBytes } from "../../src/unlock/codec.js";
import { buildPayload, canonicalPayload, importPrivateKey, signPayload } from "../../src/unlock/sign.js";
import { PUBLIC_KEY } from "../../src/unlock/public-key.js";
import { verifyCode, verifySignedCode } from "../../src/unlock/verify.js";
import { verifyLemonSqueezyLicense } from "../../src/unlock/lemonsqueezy.js";
import { ledgerCsv } from "../../src/unlock/ledger.js";

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
    expect(csv.toLowerCase()).not.toContain("email");
  });

  it("publishes a test public key with no private material", () => {
    expect(PUBLIC_KEY.d).toBeUndefined();
    expect(privateJwk._warning).toMatch(/TEST\/DEV/i);
    expect(privateJwk.x).toBe(PUBLIC_KEY.x);
  });
});
