#!/usr/bin/env node
/**
 * Create the Ribbonwren Bingo unlock key pair ONCE.
 *
 * The private key is written OUTSIDE this repo. Anyone with that file can
 * make unlock codes. Keep it, plus one backup Matthew controls (a password
 * manager or a USB drive). Do not commit it.
 *
 * This tool refuses to write the private key inside the repository.
 * src/unlock/public-key.js already holds the production public key.
 * tests/fixtures/TEST_DEV_PRIVATE_KEY.json is a separate test key. It does
 * not match that public key, and a production build rejects codes it signs.
 * To rotate the production key, replace PUBLIC_KEY with the public key this
 * tool prints and keep KEY_STATUS at "production".
 *
 * Usage:
 *   node tools/make-keys.mjs ~/ribbonwren-unlock-PRIVATE.jwk
 *   node tools/make-keys.mjs --force ~/ribbonwren-unlock-PRIVATE.jwk
 */

import { writeFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ownerCodeFromPrivateJwk } from "./make-owner-code.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--force");
const force = process.argv.includes("--force");
const destination = resolve(args[0] || resolve(repoRoot, "..", "ribbonwren-unlock-PRIVATE.jwk"));
const rel = relative(repoRoot, destination);

if (rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"))) {
  console.error("Refusing to write the private key inside the repo.");
  console.error("Pass a path outside the repo, for example:");
  console.error("  node tools/make-keys.mjs ~/ribbonwren-unlock-PRIVATE.jwk");
  process.exit(1);
}

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
privateJwk.alg = "ES256";
publicJwk.alg = "ES256";
privateJwk.kid = "ribbonwren-bingo-unlock";
publicJwk.kid = "ribbonwren-bingo-unlock";

writeFileSync(destination, `${JSON.stringify(privateJwk, null, 2)}\n`, {
  flag: force ? "w" : "wx",
  mode: 0o600,
});

console.log(`Wrote the private key to ${destination}`);
console.log("Back it up. It is not in git. Losing it means you cannot make new codes.");
console.log("");
console.log("Public key. Put this object in src/unlock/public-key.js");
console.log('and set KEY_STATUS to "production":');
console.log(JSON.stringify(publicJwk, null, 2));

const owner = await ownerCodeFromPrivateJwk(privateJwk, { name: "Owner", order: "owner" });
console.log("");
console.log(`Owner code ${owner.payload.id}. Paste it into owner.html before you deploy.`);
console.log("The page's code maker only makes Pro codes, and it stays locked until this code is accepted.");
console.log("Make another any time with:");
console.log(`  node tools/make-owner-code.mjs ${destination}`);
console.log(owner.link);
console.log(owner.code);
