import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buildPayload, importPrivateKey, signPayload } from "../../src/unlock/sign.js";

const privateJwk = JSON.parse(readFileSync(new URL("../fixtures/TEST_DEV_PRIVATE_KEY.json", import.meta.url), "utf8"));

async function codeFor(tier, name, order) {
  const key = await importPrivateKey(privateJwk);
  return signPayload(key, buildPayload({ tier, name, order, date: "2026-10-17" }));
}

test("a production build ignores ?lstest=1 while the store is in test mode", async ({ page }) => {
  await page.goto("./?lstest=1");
  await expect(page.getByRole("heading", { name: "Ribbonwren Bingo" })).toBeVisible();
  await expect(page.locator("#pro-test-mode")).toHaveCount(0);
  await expect(page.locator("a#get-pro")).toHaveCount(0);
  await expect(page.locator('a[href*="lemonsqueezy"]')).toHaveCount(0);
  await expect(page.locator('a[href*="checkout"]')).toHaveCount(0);
  await expect(page.locator("#get-pro")).toHaveText("Pro coming soon");
  await expect(page.getByText("Test mode")).toHaveCount(0);
});

test("a production build refuses a test-mode license key", async ({ page }) => {
  const key = "38b1460a-5104-4067-a91d-77b872934d51";
  const instance = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";
  const hits = [];
  await page.route("https://api.lemonsqueezy.com/v1/licenses/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    hits.push(path);
    if (path.endsWith("/deactivate")) {
      await route.fulfill({ json: { deactivated: true, error: null } });
      return;
    }
    await route.fulfill({
      json: {
        activated: true,
        valid: true,
        error: null,
        license_key: {
          id: 42,
          status: "active",
          key,
          test_mode: true,
          activation_limit: 3,
          activation_usage: 1,
          expires_at: null,
        },
        instance: { id: instance, name: "Ribbonwren Bingo - browser" },
        meta: { store_id: 500556, product_id: 1449237, variant_id: 2262220 },
      },
    });
  });
  await page.goto("./index.html");
  await page.locator("#unlock-code").fill(key);
  await page.locator("#unlock-button").click();
  await expect(page.locator("#licensed")).toBeHidden();
  await expect(page.locator("#unlock-msg")).toHaveText("This is a test license key, so it can't unlock the live site.");
  await expect(page.locator("#unlock-code")).toHaveValue("");
  expect(hits.map((path) => path.split("/").pop())).toEqual(["validate"]);
  expect(await page.evaluate(() => localStorage.getItem("rwb-unlock-pro"))).toBeNull();
});

test("a production build forgets a stored test-mode activation", async ({ page }) => {
  const key = "38b1460a-5104-4067-a91d-77b872934d51";
  const instance = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";
  const hits = [];
  await page.addInitScript(({ storedKey, storedInstance }) => {
    localStorage.setItem("rwb-unlock-pro", JSON.stringify({
      code: storedKey,
      provider: "lemonsqueezy",
      instanceId: storedInstance,
      validatedAt: Date.now() - 1000,
    }));
  }, { storedKey: key, storedInstance: instance });
  await page.route("https://api.lemonsqueezy.com/v1/licenses/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    hits.push(path);
    if (path.endsWith("/deactivate")) {
      await route.fulfill({ json: { deactivated: true, error: null } });
      return;
    }
    await route.fulfill({
      json: {
        valid: true,
        error: null,
        license_key: { id: 42, status: "active", key, test_mode: true },
        instance: { id: instance, name: "Ribbonwren Bingo - browser" },
        meta: { store_id: 500556, product_id: 1449237, variant_id: 2262220 },
      },
    });
  });
  await page.goto("./index.html");
  await expect(page.locator("#licensed")).toBeHidden();
  await expect(page.locator("#unlock-msg")).toHaveText("This is a test license key, so it can't unlock the live site.");
  expect(hits.some((path) => path.endsWith("/validate"))).toBe(true);
  expect(hits.some((path) => path.endsWith("/deactivate"))).toBe(true);
  expect(hits.some((path) => path.endsWith("/activate"))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("rwb-unlock-pro"))).toBeNull();
});

test("a production build decodes a HEIC photo under the page policy", async ({ page }) => {
  const code = await codeFor("pro", "Sam", "1002");
  await page.goto(`./index.html#unlock=${encodeURIComponent(code)}`);
  await expect(page.locator("#licensed")).toContainText("Licensed to Sam");
  await page.getByRole("radio", { name: "Pictures" }).check();
  await page.locator("#picture-input").setInputFiles({
    name: "tiny.heic",
    mimeType: "image/heic",
    buffer: readFileSync(new URL("../fixtures/tiny.heic", import.meta.url)),
  });
  await expect(page.locator("#picture-list img")).toHaveCount(1);
  await expect.poll(() => page.locator("#picture-list img").first().evaluate((img) => img.naturalWidth), { timeout: 25000 }).toBeGreaterThan(0);
  await expect(page.locator("#pictures-msg")).not.toContainText("HEIC");
});
