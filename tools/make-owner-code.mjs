#!/usr/bin/env node
/**
 * Mint an owner-tier unlock code from the private key file.
 *
 * The code maker on owner.html only makes Pro codes, and it sits behind the
 * owner gate. This is how Matthew gets in after the production key replaces
 * the test key.
 *
 * Usage:
 *   node tools/make-owner-code.mjs ~/ribbonwren-unlock-PRIVATE.jwk
 *   node tools/make-owner-code.mjs ~/ribbonwren-unlock-PRIVATE.jwk "Matthew" "owner"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { siteConfig } from "../src/config.js";
import { buildPayload, importPrivateKey, signPayload } from "../src/unlock/sign.js";

export async function ownerCodeFromPrivateJwk(jwk, options = {}) {
  const privateKey = await importPrivateKey(jwk);
  const payload = buildPayload({
    tier: "owner",
    name: options.name || "Owner",
    order: options.order || "owner",
    id: options.id,
    date: options.date,
  });
  const code = await signPayload(privateKey, payload);
  const link = `${siteConfig.siteUrl}owner.html#unlock=${encodeURIComponent(code)}`;
  return { code, payload, link };
}

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error("Usage: node tools/make-owner-code.mjs <private-key.jwk> [first-name] [order-reference]");
    process.exit(1);
  }
  const jwk = JSON.parse(readFileSync(resolve(keyPath), "utf8"));
  const minted = await ownerCodeFromPrivateJwk(jwk, {
    name: process.argv[3],
    order: process.argv[4],
  });
  console.log(`Owner code ${minted.payload.id} for ${minted.payload.n || "Owner"}.`);
  console.log("Paste it into owner.html, or open this link once:");
  console.log(minted.link);
  console.log("");
  console.log(minted.code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
