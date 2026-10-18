/**
 * Etsy delivery PDFs (owner-mode custom orders, and anything meant for the
 * shop) must not contain links, email addresses, or web addresses.
 * Words such as Pro, Unlock, and Upgrade are warnings: the owner can
 * print them after an explicit override. A single word plus a short TLD
 * such as Join.us is the same kind of warning, because it is often a
 * sentence and not a site. So is a spelled "dot com" with no host name
 * in front of it ("Dot com bubble", "polka dot store"). A host written
 * out, such as "ribbonwren dot com", stays a hard block, as do real
 * hosts, paths, www, emails, Lemon Squeezy, and Gumroad. QR is a warning.
 * Buyer text, the seed, and the free-space line are all checked. Text is
 * normalized with NFKC first so full-width lookalikes such as ｈｔｔｐｓ://
 * are caught. Parenthetical dots, spaced dots, and the ideographic full
 * stop are folded into a normal dot before that scan.
 */
const HARD = new Set(["url", "www", "domain", "email", "lemon", "gumroad"]);
// Short TLDs that are also ordinary words. "Mr.Me" and "Join.us" can be a
// sentence, so the owner may print them. com, tv, ee, and the rest stay blocked.
const WORD_TLDS = new Set(["us", "me", "co"]);
// Ordinary words that sit in front of "dot" in a phrase, not a host name.
const DOT_PHRASE = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "with", "on", "in",
  "my", "your", "our", "her", "his", "its", "one", "big", "little",
  "red", "blue", "black", "white", "green", "pink", "gold", "silver",
  "polka", "spot", "spots", "color", "colour", "colored", "coloured",
]);
const REAL_TLDS = "com|net|org|io|co|uk|ca|us|shop|store|app|dev|info|biz|me|etsy|ly|gl|ee|xyz|site|link|tv|gg|click|online|page";

// A hostname with no scheme, such as example.com, linktr.ee, or twitch.tv.
const BARE_DOMAIN = new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${REAL_TLDS})\\b`, "i");
const SPELLED_DOMAIN = new RegExp(`\\b(?:([a-z0-9][a-z0-9-]*)\\s+)?dot\\s+(?:${REAL_TLDS})\\b`, "gi");
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
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\u3002/g, ".")
    .replace(/[({\[]\.[)}\]]/g, ".")
    .replace(/([a-z0-9])\s+\.\s+(?=[a-z])/gi, "$1.");
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

/** "ribbonwren dot com" is a host. "Polka dot store" is a phrase. */
function spelledDomainCodes(value) {
  const re = new RegExp(SPELLED_DOMAIN.source, "gi");
  let hard = false;
  let soft = false;
  for (const match of value.matchAll(re)) {
    const label = match[1] || "";
    if (label && !DOT_PHRASE.has(label.toLowerCase())) hard = true;
    else soft = true;
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
  const spelled = spelledDomainCodes(value);
  const domains = domainIssueCodes(value);
  if (spelled.includes("domain") || domains.includes("domain")) issues.push("domain");
  else if (spelled.includes("domain-word") || domains.includes("domain-word")) issues.push("domain-word");
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
    .replace(new RegExp(SPELLED_DOMAIN.source, "gi"), (full, label) => {
      if (label && !DOT_PHRASE.has(String(label).toLowerCase())) return "";
      return full;
    })
    .replace(new RegExp(BARE_DOMAIN.source, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}
