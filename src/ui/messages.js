/** User-facing copy for the public pages. No marketplace names and no turnaround promise. */

export function tooFewMessage(error) {
  const free = error.freeSpace ? " with a free space" : "";
  return `You need at least ${error.needed} items for a ${error.grid}×${error.grid} card${free}. You have ${error.have}. You need ${error.more} more.`;
}

export function supplyWarning(warning) {
  if (warning.code === "exact-fit") {
    return "Every card has the same words in a different order, so several people may win at once.";
  }
  if (warning.code === "low-variety") {
    return "For a better game, add more items (about 2× the squares).";
  }
  if (warning.code === "long-item") {
    return `"${clip(warning.item)}" is longer than 80 characters and may print very small.`;
  }
  if (warning.code === "rtl") {
    return "This list includes right-to-left text, which may not display correctly.";
  }
  if (warning.code === "many-items") {
    return "That's a long list. The call sheet will run onto several pages.";
  }
  if (warning.code === "comma-item") {
    return `"${clip(warning.item)}" still has commas or semicolons, so it stays one square. Use Split on commas if each piece should be its own square.`;
  }
  return "";
}

export function cardCountMessage(result) {
  if (result.ok) return "";
  if (result.code === "too-small") return "Enter at least 1 card.";
  if (result.code === "not-integer") return "Enter a whole number of cards.";
  if (result.code === "over-cap" && result.tier === "free") {
    return "Unlock Pro for up to 500 cards.";
  }
  if (result.code === "over-cap") return `You can make up to ${result.max} cards at a time.`;
  return "Enter a whole number of cards.";
}

export function tooLongMessage(sample, grid, perPage) {
  const shown = clip(sample);
  return `"${shown}" is too long for a ${grid}×${grid} card at ${perPage} per page. Try 1 per page.`;
}

export function duplicateMessage(group) {
  const dropped = group.dropped.join(", ");
  return `Keeping "${group.kept}". Not using the repeat ${dropped}.`;
}

export function licensedLabel(payload) {
  const name = String(payload?.n || "").trim();
  if (payload?.tier === "owner") {
    return name ? `Owner mode · Licensed to ${name}` : "Owner mode is on";
  }
  return name ? `Pro unlocked · Licensed to ${name}` : "Pro unlocked";
}

export function unlockError(reason) {
  if (reason === "revoked") return "This code has been revoked.";
  if (reason === "empty") return "Enter an unlock code.";
  if (reason === "not-configured") return "That code type isn't available yet.";
  return "This code isn't valid.";
}

export function pictureError(code) {
  if (code === "too-big") return "Please use a photo under 20 MB.";
  if (code === "heic") {
    return "This HEIC photo couldn't be converted in this browser. On an iPhone, open the photo, tap Share, then Save to Files and choose JPEG. On a computer, export the photo as JPEG or PNG and upload that file.";
  }
  if (code === "limit") return "You can add up to 75 pictures.";
  return "This file doesn't look like a PNG, JPEG, WebP, or HEIC image.";
}

export function emojiNote() {
  return "Emoji will look like your device's style.";
}

export function emojiDropped(list) {
  return `Some symbols couldn't be drawn and were left off the card: ${list.join(" ")}`;
}

function clip(text) {
  const value = String(text ?? "");
  return value.length > 42 ? `${value.slice(0, 39)}…` : value;
}

export const FREE_FOOTER = "Made free with Ribbonwren Paper Co. · ribbonwren bingo";

export const PRO_COMING_SOON = "Pro coming soon";

export const PRO_PRICE_NOTE = "Lifetime Pro is $19.99. Online checkout is not open yet.";
