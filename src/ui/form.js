import { validateSupply, parseItems, freeSpaceAllowed, neededCount } from "../core/items.js";
import { normalizeSeed } from "../core/rng.js";
import { getLimits, themeAllowed, validateCardCount } from "../core/limits.js";
import {
  cardCountMessage,
  duplicateMessage,
  pictureError,
  supplyWarning,
  tooFewMessage,
} from "./messages.js";

export function assessForm(input, tier) {
  const grid = Number(input.grid);
  const freeSpace = freeSpaceAllowed(grid) && Boolean(input.freeSpace);
  const mode = input.mode === "pictures" ? "pictures" : "words";
  const limits = getLimits(tier);
  const parsed =
    mode === "words"
      ? parseItems(input.words || "", { mode: input.separatorMode === "auto" ? "auto" : "lines" })
      : { items: [], duplicates: [], warnings: [] };
  const pictureItems = (input.pictures || []).map((picture) => picture.caption || picture.name || "Picture");
  const supplyItems = mode === "pictures" ? pictureItems : parsed.items;
  const supply = validateSupply(supplyItems, { grid, freeSpace });
  const count = validateCardCount(tier, input.cardCount);
  const errors = [];
  const warnings = [];

  if (![3, 4, 5].includes(grid)) errors.push({ field: "grid", text: "Choose a 3×3, 4×4, or 5×5 grid." });
  for (const error of supply.errors) {
    if (error.code === "free-space-grid") {
      errors.push({
        field: "free-space",
        text: "A free space sits in the center, so it is only available for 3×3 and 5×5 cards.",
      });
    } else if (error.code === "too-few") {
      errors.push({ field: mode === "pictures" ? "pictures" : "words", text: tooFewMessage(error) });
    }
  }
  if (!count.ok) errors.push({ field: "card-count", text: cardCountMessage(count) });
  if (!/[A-Z0-9]/.test(normalizeSeed(input.seed))) {
    errors.push({
      field: "seed",
      text: "Enter a seed with at least one letter or digit. Dashes and spaces are ignored.",
    });
  }
  if (input.requireOrder && !String(input.order ?? "").trim()) {
    errors.push({ field: "order", text: "Enter the order number." });
  }
  if (mode === "pictures" && !limits.pictures) {
    errors.push({ field: "pictures", text: "Pictures are part of Pro." });
  }
  if (input.theme && !themeAllowed(tier, input.theme)) {
    errors.push({ field: "theme", text: "That theme is part of Pro." });
  }
  if (![1, 2].includes(Number(input.cardsPerPage))) {
    errors.push({ field: "per-page", text: "Choose 1 or 2 cards per page." });
  }

  for (const group of parsed.duplicates) warnings.push({ field: "words", text: duplicateMessage(group) });
  for (const warning of parsed.warnings) {
    const text = supplyWarning(warning);
    if (text) warnings.push({ field: "words", text });
  }
  for (const warning of supply.warnings) {
    const text = supplyWarning(warning);
    if (text) warnings.push({ field: "words", text });
  }
  if ((input.pictures || []).length > limits.maxPictures && limits.pictures) {
    errors.push({ field: "pictures", text: pictureError("limit") });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    parsed,
    items: supplyItems,
    freeSpace,
    grid,
    count: count.ok ? count.count : null,
    needed: neededCount(grid, freeSpace),
    mode,
  };
}
