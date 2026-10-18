/**
 * Site settings Matthew can change without hunting through the app.
 *
 * purchaseUrl is the only "Get Pro" destination. Leave it empty to show
 * "Pro coming soon" with no link. The URL below is the TEST checkout.
 * While lemonSqueezy.mode is "test", the public site does not show that
 * link. A dev build, or ?lstest=1, shows it for QA. mode "live" shows it.
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

/**
 * The public site shows the checkout only when the store mode is live.
 * Test mode stays "Pro coming soon" unless this is a dev build or the
 * page was opened with ?lstest=1.
 * A shown link gets locale=en, the checkout_options.locale value, unless
 * the URL already has a locale. That keeps the hosted checkout in English.
 */
export function checkoutHref({
  mode = siteConfig.lemonSqueezy?.mode,
  dev = false,
  search = "",
  purchaseUrl = siteConfig.purchaseUrl,
} = {}) {
  const url = String(purchaseUrl ?? "").trim();
  if (!url) return null;
  const flag = new URLSearchParams(String(search || "").replace(/^\?/, "")).get("lstest") === "1";
  const show = mode === "live" || (mode === "test" && (dev === true || flag));
  if (!show) return null;
  return withEnglishLocale(url);
}

function withEnglishLocale(url) {
  try {
    const next = new URL(url);
    if (!next.searchParams.has("locale")) next.searchParams.set("locale", "en");
    return next.toString();
  } catch {
    return url;
  }
}
