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
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** True when more than half of the non-empty lines contain a comma or semicolon. */
export function linesUseDelimiters(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const marked = lines.filter((line) => /[,;]/.test(line)).length;
  return marked > lines.length / 2;
}

/**
 * Split on commas and semicolons that sit outside double quotes.
 * `"milk, cookies"` stays one item, and the wrapping quotes are removed.
 * A doubled quote inside a quoted item is a literal quote.
 */
const OPEN_CURLY = "\u2018";
const CLOSE_CURLY = "\u2019";

/**
 * A leading ‘ is a quote only when a closing ’ appears later in the line.
 * iOS types ‘ at the start of 'tis and 'twas and does not add a closer. That mark
 * stays a plain character, so the next comma or the end of the line still splits.
 * A ’ followed by a letter, as in Santa’s, is an apostrophe, not a closer.
 */
function curlyQuoteClosesLater(value, openIndex) {
  for (let i = openIndex + 1; i < value.length; i++) {
    if (value[i] === CLOSE_CURLY && !/[A-Za-z0-9]/.test(value[i + 1] || "")) return true;
  }
  return false;
}

export function splitDelimited(text) {
  const parts = [];
  let current = "";
  let quote = "";
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote === '"') {
      if (ch === '"') {
        if (value[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quote = "";
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (quote === OPEN_CURLY) {
      if (ch === CLOSE_CURLY && !/[A-Za-z0-9]/.test(value[i + 1] || "")) quote = "";
      else current += ch;
      continue;
    }
    if (ch === '"') {
      quote = '"';
      continue;
    }
    if (ch === OPEN_CURLY && current.trim() === "" && curlyQuoteClosesLater(value, i)) {
      quote = OPEN_CURLY;
      continue;
    }
    if (ch === "," || ch === ";") {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function hasUnquotedDelimiter(text) {
  let quote = "";
  let current = "";
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote === '"') {
      if (ch === '"') {
        if (value[i + 1] === '"') i += 1;
        else quote = "";
      }
      current += ch;
      continue;
    }
    if (quote === OPEN_CURLY) {
      if (ch === CLOSE_CURLY && !/[A-Za-z0-9]/.test(value[i + 1] || "")) quote = "";
      else current += ch;
      continue;
    }
    if (ch === '"') {
      quote = '"';
      current += ch;
      continue;
    }
    if (ch === OPEN_CURLY && current.trim() === "" && curlyQuoteClosesLater(value, i)) {
      quote = OPEN_CURLY;
      continue;
    }
    if (ch === "," || ch === ";") return true;
    current += ch;
  }
  return false;
}

/** Split every line on commas and semicolons, keeping quoted commas together. */
export function forceSplitDelimiters(raw) {
  const text = normalizeRaw(raw);
  const items = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const pieces = /[,;]/.test(line) ? splitDelimited(line) : [line];
    for (const piece of pieces) {
      const trimmed = stripWrappingQuotes(piece);
      if (trimmed) items.push(trimmed);
    }
  }
  return items.join("\n");
}

function stripWrappingQuotes(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  if (trimmed.length >= 2 && trimmed.startsWith(OPEN_CURLY) && trimmed.endsWith(CLOSE_CURLY)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * @param {string} raw
 * @param {{ mode?: "lines" | "auto" }} [options]
 * mode "auto" (owner page): split on commas and semicolons when most
 * non-empty lines contain one. A trailing newline does not cancel that.
 * A list that is mostly one item per line stays that way, so
 * "milk, cookies" on its own line can still be a single square.
 */
export function parseItems(raw, options = {}) {
  const mode = options.mode === "auto" ? "auto" : "lines";
  const text = normalizeRaw(raw);
  const lines = text.split("\n");
  const warnings = [];
  let parts;
  if (mode === "auto" && linesUseDelimiters(text)) {
    parts = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/[,;]/.test(line)) parts.push(...splitDelimited(line));
      else parts.push(line);
    }
  } else {
    parts = lines;
    if (mode === "auto") {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && hasUnquotedDelimiter(trimmed)) {
          warnings.push({ code: "comma-item", item: stripWrappingQuotes(trimmed) });
        }
      }
    }
  }

  const items = [];
  const groups = [];
  const byKey = new Map();

  for (const part of parts) {
    const trimmed = stripWrappingQuotes(part);
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
