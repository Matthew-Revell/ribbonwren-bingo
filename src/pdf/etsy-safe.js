/**
 * Etsy delivery PDFs (owner-mode custom orders, and anything meant for the
 * shop) must not contain links, email addresses, or web addresses.
 * Words such as Pro, Unlock, and Upgrade are warnings: the owner can
 * print them after an explicit override. Buyer text, the seed, and the
 * free-space line are all checked. Text is normalized with NFKC first so
 * full-width lookalikes such as ｈｔｔｐｓ:// are caught.
 */
const HARD = new Set(["url", "www", "domain", "email"]);

// A hostname with no scheme, such as example.com, bit.ly/x, or pages.github.io.
const BARE_DOMAIN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|uk|ca|us|shop|store|app|dev|info|biz|me|etsy|ly|gl)\b/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const RULES = [
  { code: "url", re: /https?:\/\//i },
  { code: "www", re: /\bwww\./i },
  { code: "domain", re: BARE_DOMAIN },
  { code: "email", re: EMAIL },
  { code: "pro", re: /\bpro\b/i },
  { code: "upgrade", re: /upgrade/i },
  { code: "unlock", re: /unlock/i },
  { code: "qr", re: /\bqr\b/i },
  { code: "lemon", re: /lemon\s*squeezy/i },
  { code: "gumroad", re: /gumroad/i },
];

function normalized(text) {
  return String(text ?? "").normalize("NFKC");
}

export function findDeliveryIssues(text) {
  const issues = [];
  const value = normalized(text);
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

export function partitionDeliveryHits(hits) {
  const hard = [];
  const soft = [];
  for (const hit of hits || []) {
    const hardIssues = [];
    const softIssues = [];
    for (const code of hit.issues || []) {
      if (HARD.has(code)) hardIssues.push(code);
      else softIssues.push(code);
    }
    if (hardIssues.length) hard.push({ text: hit.text, issues: hardIssues });
    if (softIssues.length) soft.push({ text: hit.text, issues: softIssues });
  }
  return { hard, soft };
}

export function scrubMeta(text) {
  return normalized(text)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(new RegExp(EMAIL.source, "gi"), "")
    .replace(new RegExp(BARE_DOMAIN.source, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}
