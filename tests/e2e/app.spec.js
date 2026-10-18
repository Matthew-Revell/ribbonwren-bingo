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

test("clear my data removes an unlock", async ({ page }) => {
  const code = await codeFor("pro", "Ada", "1009");
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Ada");
  await page.getByRole("button", { name: "Clear my data" }).click();
  await expect(page.locator("#licensed")).toBeHidden();
  await expect(page.locator("#download-status")).toContainText("removed from this browser");
  await page.reload();
  await expect(page.locator("#licensed")).toBeHidden();
});

test("explains when a long phrase will not fit two cards on a page", async ({ page }) => {
  await page.goto("./index.html");
  const words = Array.from({ length: 23 }, (_, index) => `word ${index}`);
  words.push("Supercalifragilisticexpialidocious".repeat(3));
  await page.locator("#words").fill(words.join("\n"));
  await page.locator("#per-page").selectOption("2");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.locator("#words-msg")).toContainText("too long");
  await expect(page.locator("#words-msg")).toContainText("2 per page");
});

test("disables the free space on a 4 by 4 grid and labels the fields", async ({ page }) => {
  await page.goto("./index.html");
  await page.getByLabel("4×4").check();
  await expect(page.locator("#free-space")).toBeDisabled();
  await expect(page.locator("#free-space")).toHaveAttribute("title", /only available for 3×3 and 5×5/);
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

test("unlocks Pro from a link and then removes it", async ({ page }) => {
  const hosts = new Set();
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    hosts.add(new URL(url).host);
  });
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
  expect(saved.text).toContain("100 cards");
  expect([...hosts].every((host) => host.startsWith("127.0.0.1") || host.startsWith("localhost"))).toBe(true);
  await page.getByRole("button", { name: "Remove unlock from this browser" }).click();
  await expect(page.locator("#licensed")).toBeHidden();
  await page.reload();
  await expect(page.locator("#licensed")).toBeHidden();
});

test("a fresh window does not keep an unlock", async ({ browser, baseURL }) => {
  const code = await codeFor("pro", "Nora", "1004");
  const first = await browser.newContext({ baseURL });
  const page = await first.newPage();
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Nora");
  await first.close();
  const second = await browser.newContext({ baseURL });
  const fresh = await second.newPage();
  await fresh.goto("./index.html");
  await expect(fresh.locator("#licensed")).toBeHidden();
  await second.close();
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
  const hosts = new Set();
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    hosts.add(new URL(url).host);
  });
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
  expect([...hosts].every((host) => host.startsWith("127.0.0.1") || host.startsWith("localhost"))).toBe(true);
});

async function openOwner(page, name, order) {
  const owner = await codeFor("owner", name, order);
  await page.goto("./owner.html");
  await page.locator("#owner-code").fill(owner);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#owner-app")).toBeVisible();
}

test("saves an owner recipe and loads it back", async ({ page }) => {
  await openOwner(page, "Matthew", "recipe");
  await page.getByLabel("3×3").check();
  const lines = Array.from({ length: 9 }, (_, index) => `Spice ${index + 1}`).join("\n");
  await page.locator("#order-number").fill("WEB-9");
  await page.locator("#buyer-name").fill("Ada");
  await page.locator("#words").fill(lines);
  await page.locator("#card-count").fill("2");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save recipe" }).click(),
  ]);
  await page.locator("#words").fill("");
  await page.locator("#load-recipe").setInputFiles(await download.path());
  await expect(page.locator("#order-status")).toContainText("Recipe loaded");
  await expect(page.locator("#words")).toHaveValue(/Spice 1/);
  await expect(page.locator("#order-number")).toHaveValue("WEB-9");
  await expect(page.locator("#buyer-name")).toHaveValue("Ada");
  await expect(page.locator("#card-count")).toHaveValue("2");
});

test("counts comma-separated items and warns before printing a sales pitch", async ({ page }) => {
  await openOwner(page, "Matthew", "words");
  const commas = Array.from({ length: 30 }, (_, index) => `word${index}`).join(", ");
  await page.locator("#words").fill(`${commas}\n`);
  await expect(page.locator("#item-count")).toHaveText("30 items");
  const lines = Array.from({ length: 12 }, (_, index) => `a${index}, b${index}, c${index}`).join("\n");
  await page.locator("#words").fill(lines);
  await expect(page.locator("#item-count")).toHaveText("36 items");

  const mixed = ["cocoa", "Snow, Sled, Cocoa, Elf, Mittens", "paper", "wool", "stone", "card", "walk", "toast"].join("\n");
  await page.locator("#words").fill(mixed);
  await page.getByLabel("3×3").check();
  await expect(page.locator("#item-count")).toHaveText("8 items");
  await expect(page.locator("#preview")).toContainText("Snow, Sled, Cocoa, Elf, Mittens");
  await expect(page.locator("#form-messages")).toContainText("Split on commas");
  await expect(page.locator("#split-commas")).toBeVisible();
  await page.locator("#split-commas").click();
  await expect(page.locator("#item-count")).toHaveText("11 items");
  await expect(page.locator("#words")).toHaveValue(/Snow\nSled\nCocoa\nElf\nMittens/);
  await expect(page.locator("#split-commas")).toBeHidden();

  const quoted = ['"milk, cookies"', ...Array.from({ length: 7 }, (_, index) => `cup ${index}`)].join("\n");
  await page.locator("#words").fill(quoted);
  await page.locator("#card-count").fill("1");
  await page.getByLabel("3×3").check();
  await expect(page.locator("#item-count")).toHaveText("8 items");
  await expect(page.locator("#preview")).toContainText("milk, cookies");

  const pitch = ["Pro tip", "Unlock", "Upgrade", ...Array.from({ length: 6 }, (_, index) => `cup ${index}`)].join("\n");
  await page.locator("#words").fill(pitch);
  await expect(page.locator("#wording-warning")).toContainText("print them anyway");
  await expect(page.locator("#wording-override")).toBeVisible();
  await page.locator("#order-number").fill("WEB-10");
  await page.getByRole("button", { name: "Make PDF" }).click();
  await expect(page.locator("#order-status")).toContainText("print them anyway");
  await page.locator("#wording-override").check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Make PDF" }).click(),
  ]);
  const saved = await pdfPages(download);
  expect(saved.text).toContain("Pro tip");
  await page.locator("#words").fill(["Unlock", ...Array.from({ length: 7 }, (_, index) => `cup ${index}`)].join("\n"));
  await expect(page.locator("#wording-override")).not.toBeChecked();

  await page.locator("#words").fill(["ribbonwren.com", ...Array.from({ length: 8 }, (_, index) => `cup ${index}`)].join("\n"));
  await expect(page.locator("#wording-warning")).toContainText("web addresses");
  await expect(page.locator("#wording-row")).toBeHidden();
  await page.getByRole("button", { name: "Make PDF" }).click();
  await expect(page.locator("#order-status")).toContainText("web addresses");

  await page.locator("#words").fill(["Join.us", ...Array.from({ length: 7 }, (_, index) => `cup ${index}`)].join("\n"));
  await expect(page.locator("#wording-override")).toBeVisible();
  await page.locator("#wording-override").check();
  const [phraseDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Make PDF" }).click(),
  ]);
  const phrase = await pdfPages(phraseDownload);
  expect(phrase.text).toContain("Join.us");

  await page.locator("#words").fill(["QR code menu", ...Array.from({ length: 7 }, (_, index) => `cup ${index}`)].join("\n"));
  await expect(page.locator("#wording-warning")).toContainText("QR");
  await expect(page.locator("#wording-warning")).not.toContainText("sales pitch");
  await expect(page.locator("#wording-override")).toBeVisible();
  await page.locator("#wording-override").check();
  const [qrDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Make PDF" }).click(),
  ]);
  const qr = await pdfPages(qrDownload);
  expect(qr.text).toContain("QR code menu");
});

test("accepts a large photo, a WebP, and several pictures", async ({ page }) => {
  const { PNG } = await import("pngjs");
  function png(width, height, rgb) {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        image.data[index] = rgb[0];
        image.data[index + 1] = rgb[1];
        image.data[index + 2] = rgb[2];
        image.data[index + 3] = 255;
      }
    }
    return PNG.sync.write(image);
  }
  const code = await codeFor("pro", "Sam", "1005");
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Sam");
  await page.getByRole("radio", { name: "Pictures" }).check();
  const files = [
    { name: "large.png", mimeType: "image/png", buffer: png(1400, 900, [180, 40, 40]) },
    { name: "mark.webp", mimeType: "image/webp", buffer: readFileSync(new URL("../fixtures/mark.webp", import.meta.url)) },
    ...Array.from({ length: 6 }, (_, index) => ({
      name: `tile-${index}.png`,
      mimeType: "image/png",
      buffer: png(40, 40, [20 + index * 20, 80, 120]),
    })),
  ];
  await page.locator("#picture-input").setInputFiles(files);
  await expect(page.locator("#picture-list img")).toHaveCount(8);
  await expect.poll(() => page.locator("#picture-list img").first().evaluate((img) => img.naturalWidth)).toBeGreaterThan(100);
  const width = await page.locator("#picture-list img").first().evaluate((img) => img.naturalWidth);
  expect(width).toBeLessThanOrEqual(600);
});
