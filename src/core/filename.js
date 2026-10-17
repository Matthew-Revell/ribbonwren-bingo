const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

function extensionOf(name) {
  const match = name.match(/(\.[A-Za-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

/** General download names. Strips path characters, emoji, and leading dots. */
export function sanitizeFilename(input, max = 120) {
  let s = String(input ?? "");
  s = s.replace(FORBIDDEN, "");
  s = s.replace(/\p{Extended_Pictographic}/gu, "");
  s = s.replace(/^\.+/, "");
  s = s.trim();
  if (!s) s = "bingo.pdf";
  if (s.length > max) {
    const ext = extensionOf(s);
    const base = ext ? s.slice(0, -ext.length) : s;
    s = `${base.slice(0, Math.max(1, max - ext.length))}${ext}`;
  }
  return s;
}

function pageToken(pageSize) {
  return String(pageSize || "").toLowerCase() === "a4" ? "A4" : "Letter";
}

function orderToken(order, room) {
  let token = String(order ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  token = token.replace(/^\.+/, "");
  if (!token) token = "order";
  if (token.length > room) token = token.slice(0, Math.max(1, room));
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
  const slug = String(title || "bingo")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "");
  const safeTitle = slug.replace(/^\.+/, "") || "bingo";
  return sanitizeFilename(`Ribbonwren-Bingo_${safeTitle}_${count}-cards_${page}.pdf`);
}
