/**
 * Site settings Matthew can change without hunting through the app.
 *
 * purchaseUrl is the only "Get Pro" destination. Leave it empty to show
 * "Pro coming soon" with no link. The URL below is the TEST checkout.
 *
 * lemonSqueezy is the test store. To go live, replace purchaseUrl and
 * this object with the live checkout URL, store id, product id, and
 * variant ids, and set mode to "live". The Test mode marker follows mode.
 *
 * shopUrl is an optional link on free-card footers. Leave it empty to print
 * the footer with no web address. Do not put a Pro sales link here.
 *
 * externalCodeType "lemonsqueezy" accepts a license key beside signed codes.
 */
export const siteConfig = {
  siteName: "Ribbonwren Bingo",
  shopName: "Ribbonwren Paper Co.",
  siteUrl: "https://matthew-revell.github.io/ribbonwren-bingo/",
  proPrice: "$19.99",
  purchaseUrl: "https://ribbonwren.lemonsqueezy.com/checkout/buy/d376910a-cd10-472a-a1bb-539ca3020be7",
  shopUrl: "",
  externalCodeType: "lemonsqueezy",
  lemonSqueezy: {
    storeId: 500556,
    productId: 1449237,
    variantIds: [2262220],
    mode: "test",
  },
  customOrderTurnaround: "2 business days",
  etsySoftBytes: 19 * 1024 * 1024,
  etsyHardBytes: 20 * 1024 * 1024,
  etsyMaxFiles: 5,
};

export function purchaseHref() {
  const url = String(siteConfig.purchaseUrl || "").trim();
  return url || null;
}
