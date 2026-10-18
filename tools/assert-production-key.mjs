#!/usr/bin/env node
/**
 * Stop a Pages deploy while the site still trusts the TEST/DEV signing key,
 * while live mode still points at the test store, or while the built files
 * still contain the test checkout.
 * Anyone with the committed test private key can forge unlock codes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { siteConfig } from "../src/config.js";
import { KEY_STATUS, PUBLIC_KEY } from "../src/unlock/public-key.js";

export const TEST_KEY_X = "kRbZ057wkFbiHYOovOVljQaT2KDxhAmNRpNdhaiwn4c";
const testDevPrivate = JSON.parse(readFileSync(new URL("../tests/fixtures/TEST_DEV_PRIVATE_KEY.json", import.meta.url), "utf8"));
export const TEST_KEY_D = testDevPrivate.d;
export const TEST_CHECKOUT_ID = "d376910a-cd10-472a-a1bb-539ca3020be7";
export const TEST_STORE_ID = 500556;
export const TEST_PRODUCT_ID = 1449237;
export const TEST_VARIANT_ID = 2262220;

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

export function liveModeBlockReason(config, configSource = "") {
  if (config?.lemonSqueezy?.mode !== "live") return "";
  const problems = [];
  const store = config.lemonSqueezy;
  if (Number(store?.storeId) === TEST_STORE_ID) problems.push("test store id");
  if (Number(store?.productId) === TEST_PRODUCT_ID) problems.push("test product id");
  if ((store?.variantIds || []).map(Number).includes(TEST_VARIANT_ID)) problems.push("test variant id");
  if (`${config.purchaseUrl || ""}\n${configSource}`.includes(TEST_CHECKOUT_ID)) problems.push("test checkout URL");
  if (!problems.length) return "";
  return `lemonSqueezy.mode is "live" but this build still has the ${problems.join(", ")}. Replace the test store values before deploying.`;
}

export function distBlockReason(text) {
  const source = String(text || "");
  const problems = [];
  const hasCheckout = source.includes(TEST_CHECKOUT_ID);
  if (hasCheckout) problems.push("the test checkout URL");
  if (source.includes("lstest")) problems.push("the lstest flag");
  if (source.includes(TEST_KEY_X)) problems.push("the test public key");
  if (TEST_KEY_D && source.includes(TEST_KEY_D)) problems.push("the test private key");
  if (source.includes("__RWB_TEST_PUBLIC_KEY")) problems.push("the dev test-key hook");
  let message = problems.length ? `The built site still contains ${problems.join(" and ")}.` : "";
  if (!hasCheckout && !source.includes("test_mode")) {
    const missing = "The built site leaves out the test checkout but does not check license_key.test_mode.";
    message = message ? `${message} ${missing}` : missing;
  }
  return message;
}

function readDist(dir) {
  let text = "";
  function walk(current) {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|html|css|map|json)$/.test(name)) text += `\n${readFileSync(path, "utf8")}`;
    }
  }
  walk(dir);
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bundleOnly = process.argv.includes("--bundle-only");
  const distFlag = process.argv.indexOf("--dist");
  const distDir = distFlag === -1 ? "" : process.argv[distFlag + 1];
  const reasons = [];
  if (!bundleOnly) {
    const key = deploymentBlockReason(KEY_STATUS, PUBLIC_KEY);
    if (key) reasons.push(key);
    const configSource = readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
    const live = liveModeBlockReason(siteConfig, configSource);
    if (live) reasons.push(live);
  }
  if (bundleOnly && !distDir) {
    reasons.push("Pass --dist with the built site directory.");
  }
  if (distDir) reasons.push(distBlockReason(readDist(distDir)));
  const blocked = reasons.filter(Boolean);
  if (blocked.length) {
    console.error(blocked.join("\n"));
    process.exit(1);
  }
  console.log(bundleOnly
    ? "The production bundle does not contain the test checkout."
    : 'KEY_STATUS is "production" and the public key is not the test key.');
}
