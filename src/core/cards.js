import {
  ALGORITHM,
  cardKey,
  itemListHash,
  settingsKey,
  shuffle,
} from "./rng.js";
import { freeSpaceAllowed, neededCount } from "./items.js";

const MAX_RETRIES = 80;

function deduped(items) {
  const seen = new Set();
  const out = [];
  items.forEach((item, index) => {
    const text = String(item ?? "").trim();
    if (!text) return;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text, itemIndex: index });
  });
  return out;
}

/**
 * Build N unique cards. Same items (same order), settings, and seed always
 * produce the same cards for ALGORITHM rwb-v1.
 */
export function buildCards({
  items,
  seed,
  grid,
  freeSpace = false,
  freeSpaceText = "FREE",
  count,
}) {
  const n = Number(grid);
  if (![3, 4, 5].includes(n)) return { ok: false, error: { code: "bad-grid", grid } };
  if (freeSpace && !freeSpaceAllowed(n)) {
    return { ok: false, error: { code: "free-space-grid", grid: n } };
  }
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1) {
    return { ok: false, error: { code: "bad-count" } };
  }

  const pool = deduped(items);
  const useFree = Boolean(freeSpace);
  const k = neededCount(n, useFree);
  if (pool.length < k) {
    return {
      ok: false,
      error: { code: "too-few", needed: k, have: pool.length, grid: n, freeSpace: useFree },
    };
  }

  const settings = settingsKey({ grid: n, freeSpace: useFree });
  const listHash = itemListHash(pool.map((item) => item.text));
  const center = (n * n - 1) / 2;
  const seen = new Set();
  const cards = [];

  for (let index = 0; index < total; index++) {
    let placed = null;
    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      const key = cardKey({ seed: String(seed ?? ""), settings, listHash, index, retry });
      const dealt = shuffle(pool, key).slice(0, k);
      const cells = [];
      let cursor = 0;
      for (let cell = 0; cell < n * n; cell++) {
        const row = Math.floor(cell / n);
        const col = cell % n;
        if (useFree && cell === center) {
          cells.push({
            row,
            col,
            free: true,
            text: freeSpaceText || "FREE",
            itemIndex: null,
          });
        } else {
          const item = dealt[cursor++];
          cells.push({
            row,
            col,
            free: false,
            text: item.text,
            itemIndex: item.itemIndex,
          });
        }
      }
      const fingerprint = cells.map((cell) => (cell.free ? "F" : String(cell.itemIndex))).join(",");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      placed = { index, number: index + 1, cells, fingerprint };
      break;
    }
    if (!placed) {
      return {
        ok: false,
        error: { code: "not-enough-unique", have: cards.length, asked: total },
      };
    }
    cards.push(placed);
  }

  return { ok: true, algorithm: ALGORITHM, cards };
}
