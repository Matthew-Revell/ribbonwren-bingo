/**
 * Site settings Matthew can change without hunting through the app.
 *
 * purchaseUrl is the only "Get Pro" destination. Leave it empty until a
 * website checkout (Lemon Squeezy, Gumroad, or similar) is chosen and
 * approved. An empty URL shows "Pro coming soon" and does not link anywhere.
 *
 * shopUrl is an optional link on free-card footers. Leave it empty to print
 * the footer with no web address. Do not put a Pro sales link here.
 *
 * externalCodeType stays null until a second unlock type is approved.
 * The signed-code path keeps working either way.
 */
export const siteConfig = {
  siteName: "Ribbonwren Bingo",
  shopName: "Ribbonwren Paper Co.",
  siteUrl: "https://matthew-revell.github.io/ribbonwren-bingo/",
  proPrice: "$19.99",
  purchaseUrl: "",
  shopUrl: "",
  externalCodeType: null,
  customOrderTurnaround: "2 business days",
  etsySoftBytes: 19 * 1024 * 1024,
  etsyHardBytes: 20 * 1024 * 1024,
  etsyMaxFiles: 5,
};

export function purchaseHref() {
  const url = String(siteConfig.purchaseUrl || "").trim();
  return url || null;
}
