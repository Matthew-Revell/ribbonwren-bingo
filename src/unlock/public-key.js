/**
 * Production public key for Ribbonwren Bingo unlock codes.
 *
 * Matthew generated this key pair on his own computer. The private key stays
 * with him and is not in this repository. This file can verify a code. It
 * cannot mint one.
 *
 * Tests sign with tests/fixtures/TEST_DEV_PRIVATE_KEY.json and pass that
 * pair's public key into the checker. A dev server used by those tests can
 * read the same public key from __RWB_TEST_PUBLIC_KEY. A production build
 * ignores that hook, so a code signed with the test fixture does not unlock
 * the public site.
 */
export const KEY_STATUS = "production";

export const PUBLIC_KEY = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  kid: "ribbonwren-bingo-unlock",
  ext: true,
  key_ops: ["verify"],
  x: "xJIUJsnBTcXwoo9qbSHbY6ALH-t_jC3JYc3NxkQVrsU",
  y: "X0wp34CTfiNh3XNhMbyz_pay1a8VG_LHcfmzhRy_AXQ",
};

export function verificationKey() {
  const override = import.meta.env.DEV ? globalThis.__RWB_TEST_PUBLIC_KEY : null;
  if (override?.x && override?.y) {
    return {
      kty: "EC",
      crv: "P-256",
      alg: "ES256",
      ext: true,
      key_ops: ["verify"],
      x: override.x,
      y: override.y,
    };
  }
  return PUBLIC_KEY;
}
