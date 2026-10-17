#!/usr/bin/env node
/**
 * Stop a Pages deploy while the site still trusts the TEST/DEV signing key.
 * Anyone with the committed test private key can forge unlock codes.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KEY_STATUS, PUBLIC_KEY } from "../src/unlock/public-key.js";

export const TEST_KEY_X = "kRbZ057wkFbiHYOovOVljQaT2KDxhAmNRpNdhaiwn4c";

export function deploymentBlockReason(status, publicKey) {
  if (status !== "production") {
    return `KEY_STATUS is ${JSON.stringify(status)}, not "production". Replace the test public key and set KEY_STATUS to "production" before deploying.`;
  }
  if (!publicKey || publicKey.d) {
    return "The public key file still contains private key material.";
  }
  if (publicKey.x === TEST_KEY_X) {
    return "The public key is still the committed TEST/DEV key. Anyone with the test private key could forge codes.";
  }
  return "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reason = deploymentBlockReason(KEY_STATUS, PUBLIC_KEY);
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
  console.log('KEY_STATUS is "production" and the public key is not the test key.');
}
