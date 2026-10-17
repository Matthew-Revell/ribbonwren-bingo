/** Single source of truth for free, Pro, and owner rules. */
export const LIMITS = {
  free: {
    id: "free",
    maxCards: 10,
    pictures: false,
    maxPictures: 0,
    themes: ["everyday", "christmas"],
    footer: true,
    perPage: [1, 2],
    saveGame: false,
    orders: false,
    codeMaker: false,
  },
  pro: {
    id: "pro",
    maxCards: 500,
    pictures: true,
    maxPictures: 75,
    themes: "all",
    footer: false,
    perPage: [1, 2],
    saveGame: true,
    orders: false,
    codeMaker: false,
  },
  owner: {
    id: "owner",
    maxCards: 500,
    pictures: true,
    maxPictures: 75,
    themes: "all",
    footer: false,
    perPage: [1, 2],
    saveGame: true,
    orders: true,
    codeMaker: true,
  },
};

export function getLimits(tier) {
  return LIMITS[tier] || LIMITS.free;
}

export function themeAllowed(tier, themeId) {
  const limits = getLimits(tier);
  if (limits.themes === "all") return true;
  return limits.themes.includes(themeId);
}

/**
 * Card count must be a whole number from 1 through the tier cap.
 * Strings are accepted so a text field can be checked before it is coerced.
 */
export function validateCardCount(tier, value) {
  const limits = getLimits(tier);
  let numeric = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+]?\d+$/.test(trimmed)) return { ok: false, code: "not-integer" };
    numeric = Number(trimmed);
  }
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return { ok: false, code: "not-integer" };
  }
  if (numeric < 1) return { ok: false, code: "too-small" };
  if (numeric > limits.maxCards) {
    return { ok: false, code: "over-cap", max: limits.maxCards, tier: limits.id };
  }
  return { ok: true, count: numeric, tier: limits.id };
}
