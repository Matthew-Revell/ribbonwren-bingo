/**
 * Site settings Matthew can change without hunting through the app.
 *
 * purchaseUrl is the only "Get Pro" destination. Leave the live URL empty
 * to show "Pro coming soon" with no link. The test checkout URL is compiled
 * into dev and VITE_LS_QA=1 builds only. A normal production build, and the
 * Pages deploy, do not contain that URL or the lstest flag.
 *
 * lemonSqueezy is the test store. To go live, put the live checkout URL in
 * livePurchaseUrl, replace the ids, set mode to "live", and delete the test
 * checkout URL from this file. The deploy refuses a live mode that still
 * has the test store id, product id, variant id, or checkout URL.
 * The Test mode marker appears only next to the test checkout link.
 *
 * shopUrl is an optional link on free-card footers. Leave it empty to print
 * the footer with no web address. Do not put a Pro sales link here.
 *
 * externalCodeType "lemonsqueezy" accepts a license key beside signed codes.
 */
const livePurchaseUrl = "";
const includeTestCheckout = typeof __INCLUDE_TEST_CHECKOUT__ !== "undefined" && __INCLUDE_TEST_CHECKOUT__;

export const siteConfig = {
  siteName: "Ribbonwren Bingo",
  shopName: "Ribbonwren Paper Co.",
  siteUrl: "https://matthew-revell.github.io/ribbonwren-bingo/",
  proPrice: "$19.99",
  purchaseUrl: includeTestCheckout
    ? "https://ribbonwren.lemonsqueezy.com/checkout/buy/d376910a-cd10-472a-a1bb-539ca3020be7"
    : livePurchaseUrl,
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
 * Test mode stays "Pro coming soon" on a production build. npm run dev
 * shows the test link. The QA query flag is compiled in only for dev and
 * for a VITE_LS_QA=1 build, and it is ignored unless dev or qaBuild is set.
 * Visitors cannot turn the test checkout on.
 */
export function checkoutHref({
  mode = siteConfig.lemonSqueezy?.mode,
  dev = false,
  search = "",
  purchaseUrl = siteConfig.purchaseUrl,
  qaBuild = false,
} = {}) {
  const url = String(purchaseUrl ?? "").trim();
  if (!url) return null;
  let flag = false;
  if (includeTestCheckout && (dev === true || qaBuild === true)) {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    flag = params.get("lstest") === "1";
  }
  const show = mode === "live" || (mode === "test" && (dev === true || flag));
  if (!show) return null;
  return url;
}
