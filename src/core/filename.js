const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

function extensionOf(name) {
  const match = name.match(/(\.[A-Za-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

/** Fold accents, drop flag emoji and joiners, then collapse stray separators. */
export function foldFilename(input) {
  let s = String(input ?? "").normalize("NFKC");
  s = s.replace(/\p{Regional_Indicator}/gu, "");
  s = s.replace(/\p{Emoji_Modifier}/gu, "");
  s = s.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
  s = s.replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, "");
  s = s.normalize("NFD").replace(/\p{M}/gu, "");
  return s;
}

function tidyPiece(value) {
  return String(value ?? "")
    .replace(/[_-]{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
}

/** General download names. Strips path characters, emoji, and leading dots. */
export function sanitizeFilename(input, max = 120) {
  let s = foldFilename(input);
  s = s.replace(FORBIDDEN, "");
  s = s.replace(/\p{Extended_Pictographic}/gu, "");
  s = s.trim();
  const ext = extensionOf(s);
  let base = ext ? s.slice(0, -ext.length) : s;
  base = tidyPiece(base);
  s = base ? `${base}${ext}` : "bingo.pdf";
  if (s.length > max) {
    const trimmedExt = extensionOf(s);
    const trimmedBase = trimmedExt ? s.slice(0, -trimmedExt.length) : s;
    s = `${trimmedBase.slice(0, Math.max(1, max - trimmedExt.length))}${trimmedExt}`;
  }
  return s;
}

function pageToken(pageSize) {
  return String(pageSize || "").toLowerCase() === "a4" ? "A4" : "Letter";
}

function orderToken(order, room) {
  let token = tidyPiece(foldFilename(order).replace(/[^A-Za-z0-9._-]/g, ""));
  if (!token) token = "order";
  if (token.length > room) token = tidyPiece(token.slice(0, Math.max(1, room))) || "order";
  return token;
}

function assertOwnerName(name) {
  if (name.length > 70 || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Unsafe owner file name: ${name}`);
  }
  return name;
}

/** RW-Bingo_<order#>_<N>c_<Letter|A4>.pdf — at most 70 safe characters. */
export function ownerCardFilename({ order, count, pageSize, part = null }) {
  const page = pageToken(pageSize);
  const n = String(Math.max(1, Math.round(Number(count) || 1)));
  const suffix = part ? `_p${part}.pdf` : ".pdf";
  const middle = `_${n}c_${page}`;
  const prefix = "RW-Bingo_";
  const room = 70 - prefix.length - middle.length - suffix.length;
  const token = orderToken(order, room);
  return assertOwnerName(`${prefix}${token}${middle}${suffix}`);
}

export function ownerRecipeFilename(order) {
  const prefix = "RW-Bingo_";
  const suffix = "_recipe.json";
  const room = 70 - prefix.length - suffix.length;
  return assertOwnerName(`${prefix}${orderToken(order, room)}${suffix}`);
}

/** Website-sale license. Not an Etsy delivery file. */
export function licenseFilename(order) {
  const prefix = "ribbonwren-bingo-license-";
  const suffix = ".pdf";
  const room = 70 - prefix.length - suffix.length;
  return assertOwnerName(`${prefix}${orderToken(order, room)}${suffix}`);
}

export function publicPdfFilename({ title, count, pageSize }) {
  const page = pageToken(pageSize);
  const slug = foldFilename(title || "bingo")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "");
  const safeTitle = slug.replace(/^\.+/, "") || "bingo";
  return sanitizeFilename(`Ribbonwren-Bingo_${safeTitle}_${count}-cards_${page}.pdf`);
}
