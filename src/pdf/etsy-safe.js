/**
 * Etsy delivery PDFs (owner-mode custom orders, and anything meant for the
 * shop) must not contain links, email addresses, or web addresses.
 * Words such as Pro, Unlock, and Upgrade are warnings: the owner can
 * print them after an explicit override. A single word plus a short TLD
 * such as Join.us is the same kind of warning, because it is often a
 * sentence and not a site. Real hosts, paths, www, emails, QR, Lemon
 * Squeezy, and Gumroad stay a hard block. Buyer text, the seed, and the
 * free-space line are all checked. Text is normalized with NFKC first so
 * full-width lookalikes such as ｈｔｔｐｓ:// are caught.
 */
const HARD = new Set(["url", "www", "domain", "email", "qr", "lemon", "gumroad"]);
// Short TLDs that are also ordinary words. "Mr.Me" and "Join.us" can be a
// sentence, so the owner may print them. com, tv, ee, and the rest stay blocked.
const WORD_TLDS = new Set(["us", "me", "co"]);
const REAL_TLDS = "com|net|org|io|co|uk|ca|us|shop|store|app|dev|info|biz|me|etsy|ly|gl|ee|xyz|site|link|tv|gg";

// A hostname with no scheme, such as example.com, linktr.ee, or twitch.tv.
const BARE_DOMAIN = new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${REAL_TLDS})\\b`, "i");
const SPELLED_DOMAIN = new RegExp(`\\b(?:[a-z0-9-]+\\s+)?dot\\s+(?:${REAL_TLDS})\\b`, "i");
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

/** A lone "Join.us" can be a sentence. Hosts, paths, and other TLDs cannot. */
function domainIssueCodes(value) {
  const re = new RegExp(BARE_DOMAIN.source, "gi");
  let hard = false;
  let soft = false;
  for (const match of value.matchAll(re)) {
    const token = match[0];
    const after = value[match.index + token.length] || "";
    const parts = token.split(".");
    const label = parts.length === 2 ? parts[0] : "";
    const tld = (parts[parts.length - 1] || "").toLowerCase();
    const wordLike = /^[A-Za-z][A-Za-z'-]*$/.test(label)
      && WORD_TLDS.has(tld)
      && after !== "/"
      && after !== ".";
    if (wordLike) soft = true;
    else hard = true;
  }
  if (hard) return ["domain"];
  if (soft) return ["domain-word"];
  return [];
}

export function findDeliveryIssues(text) {
  const issues = [];
  const value = normalized(text);
  for (const rule of RULES) {
    if (rule.code === "domain") continue;
    if (rule.re.test(value)) issues.push(rule.code);
  }
  if (SPELLED_DOMAIN.test(value)) issues.push("domain");
  issues.push(...domainIssueCodes(value));
  return [...new Set(issues)];
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
    .replace(new RegExp(SPELLED_DOMAIN.source, "gi"), "")
    .replace(new RegExp(BARE_DOMAIN.source, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}
