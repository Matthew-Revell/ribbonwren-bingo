import { b64urlToBytes } from "./codec.js";
import { PUBLIC_KEY } from "./public-key.js";

function fail(reason) {
  return { ok: false, reason };
}

/**
 * Check a signed unlock code offline.
 * Order: structure, signature, version, tier, then revocation.
 * A future code type that is not a signed payload is handled by verifyCode.
 */
export async function verifySignedCode(code, options = {}) {
  const publicKey = options.publicKey || PUBLIC_KEY;
  const revokedIds = options.revokedIds || [];
  if (code == null || String(code).trim() === "") return fail("empty");
  const parts = String(code).trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return fail("garbage");

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  } catch {
    return fail("garbage");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("garbage");

  let signatureOk = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    signatureOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64urlToBytes(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
  } catch {
    return fail("garbage");
  }
  if (!signatureOk) return fail("signature");
  if (payload.v !== 1) return fail("version");
  if (payload.tier !== "pro" && payload.tier !== "owner") return fail("tier");
  if (payload.id && revokedIds.includes(payload.id)) return fail("revoked");
  return { ok: true, payload, kind: "signed" };
}

/**
 * Signed codes contain a dot. Anything else is reserved for a second code
 * type (phase 2). That path is not configured until siteConfig says so.
 */
export async function verifyCode(code, options = {}) {
  const raw = String(code ?? "").trim();
  if (!raw) return fail("empty");
  if (raw.includes(".")) return verifySignedCode(raw, options);
  const external = options.externalVerify;
  if (typeof external === "function") return external(raw, options);
  return fail("not-configured");
}

export async function loadRevokedIds(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}
