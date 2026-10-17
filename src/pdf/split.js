import { siteConfig } from "../config.js";

export function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function splitRanges(count, parts) {
  const total = Math.max(0, count);
  const n = Math.max(1, parts);
  const base = Math.floor(total / n);
  let extra = total % n;
  const ranges = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const len = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    if (len <= 0) continue;
    ranges.push({ start, end: start + len });
    start += len;
  }
  return ranges;
}

/**
 * Decide whether one file is enough. When it is over the soft limit, render
 * even slices (2 to maxFiles) and keep the smallest split where every part
 * is under the soft limit. `renderSlice({ start, end, part, parts })` returns
 * bytes for that card range.
 */
export async function buildDeliveryFiles({
  cardCount,
  singleBytes,
  renderSlice,
  soft = siteConfig.etsySoftBytes,
  maxFiles = siteConfig.etsyMaxFiles,
}) {
  if (singleBytes.length < soft) {
    return { warn: false, split: false, files: [{ part: null, parts: 1, bytes: singleBytes }] };
  }
  for (let parts = 2; parts <= maxFiles; parts++) {
    const ranges = splitRanges(cardCount, parts);
    const files = [];
    let fits = true;
    for (let i = 0; i < ranges.length; i++) {
      const bytes = await renderSlice({ ...ranges[i], part: i + 1, parts });
      files.push({ part: i + 1, parts, bytes, range: ranges[i] });
      if (bytes.length >= soft) fits = false;
    }
    if (fits) return { warn: true, split: true, files };
  }
  return { warn: true, split: false, files: null, reason: "still-too-big" };
}

export function deliveryWarning(byteLength, soft = siteConfig.etsySoftBytes) {
  if (byteLength < soft) return null;
  return `This file is about ${formatMegabytes(byteLength)} MB. Etsy allows 20 MB per file and at most 5 files. Split it into smaller files before uploading a custom order.`;
}
