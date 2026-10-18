import { expect, test } from "@playwright/test";

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
