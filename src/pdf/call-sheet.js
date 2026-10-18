import { paginateCallSheet } from "./layout.js";
import { fitText } from "./fit-text.js";

export function sortLabels(labels) {
  return labels.slice().sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

export function layoutCallSheet({ labels, pageWidth, pageHeight, measure }) {
  const entries = labels.map((label) => (typeof label === "string" ? { label, imageId: null } : label));
  const sorted = entries
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" }));
  const cols = pageWidth > 700 ? 3 : 2;
  const gap = 14;
  const margin = 36;
  const colW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const textWidth = colW - 18;
  const layouts = sorted.map((entry) => {
    const fit = fitText(entry.label, {
      maxWidth: textWidth,
      maxHeight: 48,
      measure,
      maxSize: 11,
      minSize: 7,
      lineHeight: 1.15,
    });
    const height = Math.max(16, fit.lines.length * fit.size * 1.15 + 5);
    return { label: entry.label, imageId: entry.imageId || null, ...fit, height };
  });
  const pagination = paginateCallSheet({
    rowHeights: layouts.map((row) => row.height),
    pageWidth,
    pageHeight,
    footerReserve: 120,
  });
  return { rows: layouts, ...pagination };
}
