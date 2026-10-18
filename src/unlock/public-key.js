/**
 * TEST/DEV public key.
 *
 * This matches tests/fixtures/TEST_DEV_PRIVATE_KEY.json. Anyone with that
 * file can forge unlock codes. It exists so tests and local owner mode work
 * before launch. It is not a production key.
 *
 * Before any real sale, Matthew runs tools/make-keys.mjs, stores the private
 * key outside the repo (and keeps a backup), replaces PUBLIC_KEY below, and
 * sets KEY_STATUS to "production". The tool also prints an owner code. Another
 * one can be made later with tools/make-owner-code.mjs. Do not commit the
 * production private key. Deploy refuses to publish while this file is still
 * the test key.
 */
export const KEY_STATUS = "test-dev";

export const PUBLIC_KEY = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  ext: true,
  key_ops: ["verify"],
  x: "kRbZ057wkFbiHYOovOVljQaT2KDxhAmNRpNdhaiwn4c",
  y: "aMeBnLYbVNw3hR_x31GN-PqJboqGL6hBUE4gQFel4no",
};
