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

export function etsyBlockedMessage(hits) {
  const sample = hits
    .slice(0, 3)
    .map((hit) => hit.text)
    .join("; ");
  return `This custom-order PDF can't include links, QR codes, or Pro wording. Edit this text first: ${sample}`;
}

export function splitTooBigMessage() {
  return "Splitting did not get every file under 19 MB. The pictures are included in each file that uses them. Use fewer pictures, or smaller photos, and try again. A marketplace delivery can use at most 5 files.";
}
