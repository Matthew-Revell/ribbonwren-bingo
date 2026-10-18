/** Copy that belongs only on the owner page. */

export const TURNAROUND =
  "Custom word-list printables are prepared within 2 business days.";

export const LICENSE_NOTE =
  "This license file is for a website sale. Do not upload this file to a marketplace, and do not describe it as a marketplace delivery.";

export const REVIEW_NOTE =
  "Review the list yourself. Don't put copyrighted characters or song lyrics on a card.";

export const KEY_NOTE =
  "The private key stays in this tab's memory. It is not saved in this browser. Close the tab when you are done, or use Remove key.";

export const LEDGER_NOTE =
  "The ledger lists the date, code id, order number, and first name. It does not store an email. Download it before you close the tab. The license PDF is what you resend if a buyer loses their code.";

function sampleOf(hits) {
  return (hits || [])
    .slice(0, 3)
    .map((hit) => hit.text)
    .join("; ");
}

function codesIn(hits) {
  return new Set((hits || []).flatMap((hit) => hit.issues || []));
}

export function etsyBlockedMessage(hits) {
  const codes = codesIn(hits);
  const parts = [];
  if (["url", "www", "domain", "email"].some((code) => codes.has(code))) {
    parts.push("web addresses, email addresses, or links");
  }
  const checkout = [];
  if (codes.has("lemon")) checkout.push("Lemon Squeezy");
  if (codes.has("gumroad")) checkout.push("Gumroad");
  if (checkout.length) parts.push(`checkout names such as ${checkout.join(" and ")}`);
  const what = parts.join(", or ") || "blocked wording";
  return `This custom-order PDF can't include ${what}. Edit this text first: ${sampleOf(hits)}`;
}

export function wordingWarning(hits) {
  const codes = codesIn(hits);
  const parts = [];
  const pitch = ["pro", "upgrade", "unlock"].filter((code) => codes.has(code));
  if (pitch.length) {
    const names = pitch.map((code) => ({ pro: "Pro", upgrade: "Upgrade", unlock: "Unlock" }[code]));
    parts.push(`a sales pitch (${names.join(", ")})`);
  }
  if (codes.has("domain-word")) parts.push("a web address such as Join.us");
  if (codes.has("qr")) parts.push("QR");
  const what = parts.join(" and ") || "wording to double-check";
  return `These words can read like ${what}. Check the box to print them anyway: ${sampleOf(hits)}`;
}

export function splitTooBigMessage() {
  return "Splitting did not get every file under 19 MB. The pictures are included in each file that uses them. Use fewer pictures, or smaller photos, and try again. A marketplace delivery can use at most 5 files.";
}
