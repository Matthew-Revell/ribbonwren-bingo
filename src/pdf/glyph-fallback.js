const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export function segmentGraphemes(text) {
  const value = String(text ?? "");
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].map((part) => part.segment);
  }
  return [...value];
}

export function isEmoji(grapheme) {
  return EMOJI.test(grapheme);
}

const SKIP = new Set([0x200d, 0xfe0f, 0xfe0e]);

export function needsImage(font, grapheme) {
  if (!grapheme) return false;
  if (isEmoji(grapheme)) return true;
  if (!font) return false;
  for (const char of grapheme) {
    const code = char.codePointAt(0);
    if (SKIP.has(code)) continue;
    if (code >= 0x1f3fb && code <= 0x1f3ff) continue;
    if (!font.hasGlyphForCodePoint(code)) return true;
  }
  return false;
}

export function textForMeasure(text, font) {
  return segmentGraphemes(text)
    .map((grapheme) => (needsImage(font, grapheme) ? "M" : grapheme))
    .join("");
}

/** Call-sheet text with missing characters removed, so the PDF never draws tofu. */
export function callLabel(text, font) {
  const plain = segmentGraphemes(text)
    .filter((grapheme) => !needsImage(font, grapheme))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return plain || "Symbol";
}

export function tokenize(text, font) {
  const tokens = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    for (const part of buf.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) tokens.push({ type: "text", text: " " });
      else tokens.push({ type: "text", text: part });
    }
    buf = "";
  };
  for (const grapheme of segmentGraphemes(text)) {
    if (needsImage(font, grapheme)) {
      flush();
      tokens.push({ type: "img", text: grapheme });
    } else {
      buf += grapheme;
    }
  }
  flush();
  return tokens;
}

export function findImageGraphemes(texts, font) {
  const found = new Set();
  for (const text of texts) {
    for (const grapheme of segmentGraphemes(text)) {
      if (needsImage(font, grapheme)) found.add(grapheme);
    }
  }
  return [...found];
}

/**
 * Draw one missing character with the device emoji font.
 * Returns null when the canvas is blank or unavailable. Callers then skip
 * the character and show a warning. They never draw an empty box.
 */
export async function rasterizeGrapheme(text, px = 96) {
  if (typeof document === "undefined") return null;
  try {
    const size = Math.max(48, Math.ceil(px));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${Math.floor(size * 0.72)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2 + size * 0.02);
    const data = ctx.getImageData(0, 0, size, size).data;
    let ink = 0;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 24) ink += 1;
    }
    if (ink < 2) return null;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export async function rasterizeGraphemes(list) {
  const images = new Map();
  const failed = [];
  for (const grapheme of list) {
    const bytes = await rasterizeGrapheme(grapheme);
    if (bytes) images.set(grapheme, bytes);
    else failed.push(grapheme);
  }
  return { images, failed };
}
