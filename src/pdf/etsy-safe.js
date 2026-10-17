/**
 * Etsy delivery PDFs (owner-mode custom orders, and anything meant for the
 * shop) must not contain upgrade text, links, QR labels, or Pro wording.
 * Buyer word lists are checked with the same rules before export so a pasted
 * URL cannot ride along in the file.
 */
const RULES = [
  { code: "url", re: /https?:\/\//i },
  { code: "www", re: /\bwww\./i },
  { code: "pro", re: /\bpro\b/i },
  { code: "upgrade", re: /upgrade/i },
  { code: "unlock", re: /unlock/i },
  { code: "qr", re: /\bqr\b/i },
  { code: "lemon", re: /lemon\s*squeezy/i },
  { code: "gumroad", re: /gumroad/i },
];

export function findDeliveryIssues(text) {
  const issues = [];
  const value = String(text ?? "");
  for (const rule of RULES) {
    if (rule.re.test(value)) issues.push(rule.code);
  }
  return issues;
}

export function deliveryIssuesIn(strings) {
  const hits = [];
  for (const text of strings) {
    const issues = findDeliveryIssues(text);
    if (issues.length) hits.push({ text: String(text), issues });
  }
  return hits;
}

export function scrubMeta(text) {
  return String(text ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
