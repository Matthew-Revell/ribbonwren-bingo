import { makeCodeId } from "../core/rng.js";
import { bytesToB64url } from "./codec.js";

export function canonicalPayload(payload) {
  return {
    v: payload.v,
    tier: payload.tier,
    id: payload.id,
    n: payload.n || "",
    o: payload.o || "",
    t: payload.t,
  };
}

export function encodePayload(payload) {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(canonicalPayload(payload))));
}

const JWK_FIELDS = ["kty", "crv", "d", "x", "y", "alg", "kid", "key_ops", "ext"];

export function publicJwkOnly(jwk) {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, alg: jwk.alg, ext: true };
}

export async function importPrivateKey(jwk) {
  const clean = {};
  for (const field of JWK_FIELDS) {
    if (jwk[field] !== undefined) clean[field] = jwk[field];
  }
  return crypto.subtle.importKey("jwk", clean, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function signPayload(privateKey, payload) {
  const encoded = encodePayload(payload);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToB64url(new Uint8Array(signature))}`;
}

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function buildPayload({ tier, name, order, id, date }) {
  return {
    v: 1,
    tier,
    id: id || makeCodeId(),
    n: String(name || "").trim(),
    o: String(order || "").trim(),
    t: date || todayIso(),
  };
}
