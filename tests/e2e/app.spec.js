import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { buildPayload, importPrivateKey, signPayload } from "../../src/unlock/sign.js";

const privateJwk = JSON.parse(readFileSync(new URL("../fixtures/TEST_DEV_PRIVATE_KEY.json", import.meta.url), "utf8"));

async function codeFor(tier, name, order) {
  const key = await importPrivateKey(privateJwk);
  return signPayload(key, buildPayload({ tier, name, order, date: "2026-10-17" }));
}

async function pdfPages(download) {
  const bytes = readFileSync(await download.path());
  const pdf = await PDFDocument.load(bytes);
  const file = `/tmp/rwb-e2e-${download.suggestedFilename()}`;
  writeFileSync(file, bytes);
  const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  return { pdf, bytes, text, name: download.suggestedFilename() };
}

test("makes a word-card PDF and blocks 11 cards on the free tier", async ({ page }) => {
  const hosts = new Set();
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    hosts.add(new URL(url).host);
  });
  await page.goto("./index.html");
  await expect(page.getByRole("heading", { name: "Ribbonwren Bingo" })).toBeVisible();
  await expect(page.getByText("Pro coming soon")).toBeVisible();
  await page.getByRole("button", { name: "Use a sample list" }).click();
  await expect(page.locator("#words")).toHaveValue(/cocoa/);
  await expect(page.locator("#preview")).not.toContainText("Your first card will show up here.");
  await page.locator("#card-count").fill("30");
  await expect(page.locator("#card-count-msg")).toContainText("Unlock Pro for up to 500");
  await page.locator("#card-count").fill("8");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const saved = await pdfPages(download);
  expect(saved.pdf.getPageCount()).toBeGreaterThanOrEqual(9);
  expect([...hosts].every((host) => host.startsWith("127.0.0.1") || host.startsWith("localhost"))).toBe(true);
});

test("keeps the list after reload and clears it", async ({ page }) => {
  await page.goto("./index.html");
  await page.locator("#words").fill("cocoa\npaper crane\n<b>hi</b>");
  await page.reload();
  await expect(page.locator("#words")).toHaveValue(/cocoa/);
  await expect(page.locator("#preview")).toContainText("<b>hi</b>");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await page.getByRole("button", { name: "Clear my data" }).click();
  await expect(page.locator("#words")).toHaveValue("");
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored.filter((key) => key.startsWith("rwb-"))).toEqual([]);
});

test("disables the free space on a 4 by 4 grid and labels the fields", async ({ page }) => {
  await page.goto("./index.html");
  await page.getByLabel("4×4").check();
  await expect(page.locator("#free-space")).toBeDisabled();
  const unlabeled = await page.locator("input, textarea, select").evaluateAll((nodes) =>
    nodes.filter((node) => {
      if (node.closest("label")) return false;
      const id = node.id;
      if (id && node.ownerDocument.querySelector(`label[for="${id}"]`)) return false;
      if (node.getAttribute("aria-label")) return false;
      return node.type !== "hidden";
    }).map((node) => node.id || node.name || node.type),
  );
  expect(unlabeled).toEqual([]);
});

test("unlocks Pro from a link and then removes it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The 100-card download runs in Chromium.");
  const code = await codeFor("pro", "Sarah", "1001");
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Sarah");
  await expect(page).not.toHaveURL(/unlock=/);
  await page.getByRole("button", { name: "Use a sample list" }).click();
  await page.locator("#card-count").fill("100");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const saved = await pdfPages(download);
  expect(saved.pdf.getPageCount()).toBeGreaterThanOrEqual(101);
  expect(saved.text).not.toContain("Made free with Ribbonwren Paper Co.");
  await page.getByRole("button", { name: "Remove unlock from this browser" }).click();
  await expect(page.locator("#licensed")).toBeHidden();
});

test("shows the picture lock, then accepts a png and explains a bad HEIC", async ({ page }) => {
  await page.goto("./index.html");
  await page.getByRole("radio", { name: "Pictures" }).check();
  await expect(page.locator("#picture-lock")).toContainText("Pictures are part of Pro");
  await expect(page.locator("#picture-input")).toBeDisabled();
  const code = await codeFor("pro", "Sam", "1002");
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Sam");
  await page.getByRole("radio", { name: "Pictures" }).check();
  await page.locator("#picture-input").setInputFiles({
    name: "star.png",
    mimeType: "image/png",
    buffer: readFileSync("public/img/star-gold.png"),
  });
  await expect(page.locator("#picture-list img")).toBeVisible();
  await page.locator("#picture-input").setInputFiles({
    name: "photo.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("this is not a heic photo"),
  });
  await expect(page.locator("#pictures-msg")).toContainText("HEIC");
});

test("owner mode names the custom-order file and keeps the private key out of storage", async ({ page }) => {
  await page.goto("./owner.html");
  await expect(page.getByRole("heading", { name: "Enter the owner code" })).toBeVisible();
  await page.locator("#owner-code").fill("not-a-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#owner-msg")).toContainText("isn't valid");
  const owner = await codeFor("owner", "Matthew", "own");
  await page.locator("#owner-code").fill(owner);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#owner-app")).toBeVisible();
  await expect(page.getByText("2 business days")).toBeVisible();
  const lines = Array.from({ length: 24 }, (_, index) => `Item ${index + 1}`).join("\n");
  await page.locator("#order-number").fill("3456789012");
  await page.locator("#words").fill(lines);
  await page.locator("#card-count").fill("4");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Make PDF" }).click(),
  ]);
  const saved = await pdfPages(download);
  expect(saved.name).toBe("RW-Bingo_3456789012_4c_Letter.pdf");
  expect(saved.name.length).toBeLessThanOrEqual(70);
  const text = Buffer.from(saved.bytes).toString("latin1");
  expect(text.toLowerCase()).not.toContain("http");
  await page.locator("#key-file").setInputFiles({
    name: "TEST_DEV_PRIVATE_KEY.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(privateJwk)),
  });
  await expect(page.locator("#key-status")).toContainText("this tab only");
  await page.locator("#code-name").fill("Sarah");
  await page.locator("#code-order").fill("WEB-22");
  await page.getByRole("button", { name: "Make code" }).click();
  await expect(page.locator("#code-link")).toContainText("#unlock=");
  await expect(page.getByText("Do not upload this file to a marketplace")).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain(privateJwk.d);
});
