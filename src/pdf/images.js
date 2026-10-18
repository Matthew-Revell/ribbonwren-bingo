export const MAX_EDGE = 600;
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PICTURES = 75;

export function fitEdge(width, height, max = MAX_EDGE) {
  const w = Number(width) || 1;
  const h = Number(height) || 1;
  if (w <= max && h <= max) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function containRect(srcW, srcH, boxW, boxH) {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  };
}

export function isHeicFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export function heicHelpMessage() {
  return "This HEIC photo couldn't be converted in this browser. On an iPhone, open the photo, tap Share, then Save to Files and choose JPEG. On a computer, export the photo as JPEG or PNG and upload that file.";
}

function canvasHasAlpha(ctx, canvas) {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 250) return true;
  }
  return false;
}

async function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let dynamicCode;

function dynamicCodeAllowed() {
  if (dynamicCode != null) return dynamicCode;
  try {
    new Function("return 1")();
    dynamicCode = true;
  } catch {
    dynamicCode = false;
  }
  return dynamicCode;
}

async function convertHeic(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const blob = await blobFromCanvas(canvas, "image/jpeg", 0.85);
      if (blob && blob.size > 0) return blob;
    } catch {
      /* Fall through to the library. */
    }
  }
  // heic2any builds a decoder with new Function, which this page's policy blocks.
  if (!dynamicCodeAllowed()) return null;
  try {
    const mod = await import("heic2any");
    const heic2any = mod.default || mod;
    const result = await Promise.race([
      heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 }),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!result) return null;
    return Array.isArray(result) ? result[0] : result;
  } catch {
    return null;
  }
}

/**
 * Shrink a picture in the browser. PNG when the image has transparency,
 * otherwise JPEG at 85%. Nothing is uploaded.
 */
export async function prepareImageFile(file) {
  if (!file) return { error: "invalid" };
  if (file.size > MAX_BYTES) return { error: "too-big" };
  let blob = file;
  let type = file.type || "";
  if (isHeicFile(file)) {
    const converted = await convertHeic(file);
    if (!converted) return { error: "heic" };
    blob = converted;
    type = converted.type || "image/jpeg";
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { error: "invalid" };
  }
  const target = fitEdge(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close?.();
  const checkAlpha = /png|webp/i.test(type) || /png|webp/i.test(file.type || "");
  const hasAlpha = checkAlpha ? canvasHasAlpha(ctx, canvas) : false;
  const mime = hasAlpha ? "image/png" : "image/jpeg";
  const out = await blobFromCanvas(canvas, mime, hasAlpha ? undefined : 0.85);
  if (!out) return { error: "invalid" };
  const bytes = new Uint8Array(await out.arrayBuffer());
  return {
    id: crypto.randomUUID(),
    name: file.name || "picture",
    caption: "",
    bytes,
    kind: hasAlpha ? "png" : "jpg",
    width: target.width,
    height: target.height,
    previewUrl: URL.createObjectURL(out),
  };
}
