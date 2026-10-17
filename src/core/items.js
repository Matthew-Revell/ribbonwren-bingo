const SPACE_LIKE = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g;
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function freeSpaceAllowed(grid) {
  return grid === 3 || grid === 5;
}

export function neededCount(grid, freeSpace) {
  const cells = Number(grid) * Number(grid);
  if (!Number.isInteger(cells) || cells <= 0) return 0;
  return freeSpace && freeSpaceAllowed(grid) ? cells - 1 : cells;
}

function normalizeRaw(raw) {
  return String(raw ?? "")
    .replace(SPACE_LIKE, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/**
 * @param {string} raw
 * @param {{ mode?: "lines" | "auto" }} [options]
 * mode "auto" (owner page): if the paste has no line breaks, commas and
 * semicolons separate items. A list that already has line breaks stays
 * one item per line, so "milk, cookies" can still be a single square.
 */
export function parseItems(raw, options = {}) {
  const mode = options.mode === "auto" ? "auto" : "lines";
  const text = normalizeRaw(raw);
  const hasBreak = text.includes("\n");
  let parts;
  if (mode === "auto" && !hasBreak && /[;,]/.test(text)) {
    parts = text.split(/[;,]/);
  } else {
    parts = text.split("\n");
  }

  const items = [];
  const groups = [];
  const byKey = new Map();
  const warnings = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (byKey.has(key)) {
      byKey.get(key).dropped.push(trimmed);
      continue;
    }
    const group = { kept: trimmed, dropped: [] };
    byKey.set(key, group);
    groups.push(group);
    items.push(trimmed);
    if ([...trimmed].length > 80) warnings.push({ code: "long-item", item: trimmed });
    if (RTL.test(trimmed)) warnings.push({ code: "rtl", item: trimmed });
  }

  if (items.length > 500) warnings.push({ code: "many-items", count: items.length });

  return {
    items,
    duplicates: groups.filter((group) => group.dropped.length > 0),
    warnings,
  };
}

export function validateSupply(items, { grid, freeSpace }) {
  const errors = [];
  const warnings = [];
  if (freeSpace && !freeSpaceAllowed(grid)) {
    errors.push({ code: "free-space-grid", grid });
  }
  const needed = neededCount(grid, freeSpace);
  const have = items.length;
  if (have < needed) {
    errors.push({
      code: "too-few",
      needed,
      have,
      more: needed - have,
      grid,
      freeSpace: Boolean(freeSpace && freeSpaceAllowed(grid)),
    });
  } else if (have === needed) {
    warnings.push({ code: "exact-fit", needed });
  }
  if (have >= needed && have < needed * 2) {
    warnings.push({ code: "low-variety", needed });
  }
  return { errors, warnings, needed };
}
