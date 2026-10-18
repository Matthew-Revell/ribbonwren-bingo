/**
 * Frozen shuffle id. Any future change to the hash, the seed folding, or
 * the deal order must bump this to rwb-v2. Recipes store the id and will
 * not reprint on a version they do not know.
 */
export const ALGORITHM = "rwb-v1";

/** No 0/O or 1/I, so seeds stay readable when someone types them back in. */
export const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32 from the public-domain PractRand JS ports. */
export function sfc32(a, b, c, d) {
  return function next() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    d = (d + 1) | 0;
    t = (t + d) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makePrng(key) {
  const [a, b, c, d] = cyrb128(String(key));
  return sfc32(a, b, c, d);
}

function defaultRandom() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

/** Six readable characters, shown as ABCD-EF. */
export function makeSeed(random = defaultRandom) {
  let raw = "";
  for (let i = 0; i < 6; i++) {
    raw += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function makeCodeId(random = defaultRandom) {
  let raw = "RW-";
  for (let i = 0; i < 6; i++) {
    raw += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)];
  }
  return raw;
}

export function itemListHash(items) {
  const [a, b, c, d] = cyrb128(items.join("\n"));
  return [a, b, c, d].map((n) => n.toString(16).padStart(8, "0")).join("");
}

/** Grid size and free-space on/off. Theme and page size do not change the deal. */
export function settingsKey({ grid, freeSpace }) {
  return `g${Number(grid)}f${freeSpace ? 1 : 0}`;
}

/**
 * Seeds are case-insensitive and ignore spaces, hyphens, en dashes,
 * em dashes, and underscores. kj4p-92, KJ4P—92, and KJ4P_92 hash the same.
 * The printed seed can still show the dashes the person typed.
 * A seed with no letters or digits, such as "---", is empty after folding.
 */
export function normalizeSeed(seed) {
  return String(seed ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s_\u2010-\u2015\u2212-]+/g, "");
}

export function cardKey({ seed, settings, listHash, index, retry = 0 }) {
  let key = `${ALGORITHM}|${normalizeSeed(seed)}|${settings}|${listHash}|card:${index}`;
  if (retry > 0) key += `|retry:${retry}`;
  return key;
}

export function shuffle(items, seedString) {
  const prng = makePrng(seedString);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
