import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCards } from "../../src/core/cards.js";
import {
  ALGORITHM,
  SEED_ALPHABET,
  cardKey,
  itemListHash,
  makeSeed,
  normalizeSeed,
  settingsKey,
  shuffle,
} from "../../src/core/rng.js";

const golden = JSON.parse(readFileSync(new URL("../fixtures/golden-v1.json", import.meta.url), "utf8"));

describe("makeSeed", () => {
  it("uses six readable characters and skips 0, O, 1, and I", () => {
    const blocked = new Set(["0", "O", "1", "I"]);
    for (let i = 0; i < 1000; i++) {
      const seed = makeSeed();
      expect(seed).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{2}$/);
      for (const char of seed.replace("-", "")) {
        expect(blocked.has(char)).toBe(false);
        expect(SEED_ALPHABET.includes(char)).toBe(true);
      }
    }
  });
});

describe("shuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("returns the same order 1000 times for one seed", () => {
    const first = shuffle(items, "same-seed");
    for (let i = 0; i < 1000; i++) {
      expect(shuffle(items, "same-seed")).toEqual(first);
    }
  });

  it("matches the frozen rwb-v1 golden orders", () => {
    expect(golden.algorithm).toBe(ALGORITHM);
    for (const [seed, orders] of Object.entries(golden.cards)) {
      orders.forEach((order, index) => {
        const key = cardKey({
          seed,
          settings: golden.settings,
          listHash: golden.listHash,
          index,
        });
        expect(settingsKey({ grid: 3, freeSpace: false })).toBe(golden.settings);
        expect(itemListHash(golden.items)).toBe(golden.listHash);
        expect(shuffle(golden.items, key).slice(0, 8)).toEqual(order);
      });
    }
  });

  it("treats seeds as the same when only case, dashes, or spaces differ", () => {
    expect(normalizeSeed("kj4p-92")).toBe("KJ4P92");
    expect(normalizeSeed("KJ4P-92")).toBe("KJ4P92");
    expect(normalizeSeed("KJ4P92")).toBe("KJ4P92");
    expect(normalizeSeed(" kj4p 92 ")).toBe("KJ4P92");
    const options = { items: golden.items, grid: 3, freeSpace: true, count: 2 };
    const dashed = buildCards({ ...options, seed: "KJ4P-92" });
    const lower = buildCards({ ...options, seed: "kj4p-92" });
    const compact = buildCards({ ...options, seed: "KJ4P92" });
    expect(dashed.ok).toBe(true);
    expect(lower.cards.map((card) => card.fingerprint)).toEqual(dashed.cards.map((card) => card.fingerprint));
    expect(compact.cards.map((card) => card.fingerprint)).toEqual(dashed.cards.map((card) => card.fingerprint));
    expect(cardKey({ seed: "kj4p-92", settings: "g3f0", listHash: "abc", index: 0 })).toBe(
      cardKey({ seed: "KJ4P-92", settings: "g3f0", listHash: "abc", index: 0 }),
    );
  });

  it("lands each item in each position within 10 percent over 10,000 shuffles", () => {
    const pool = ["a", "b", "c", "d", "e"];
    const counts = pool.map(() => Array(pool.length).fill(0));
    for (let i = 0; i < 10000; i++) {
      const order = shuffle(pool, `fair-${i}`);
      order.forEach((item, position) => {
        counts[pool.indexOf(item)][position] += 1;
      });
    }
    const average = 10000 / pool.length;
    for (const row of counts) {
      for (const count of row) {
        expect(Math.abs(count - average) / average).toBeLessThanOrEqual(0.1);
      }
    }
  });
});
