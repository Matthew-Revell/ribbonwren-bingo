/**
 * Wrap and shrink text so it fits a box. Every caller uses the same minimum
 * of 7pt. A single long word is split with a hyphen before it is allowed to
 * overflow.
 */
export function wrapText(text, size, maxWidth, measure) {
  const raw = String(text ?? "").trim();
  const words = raw.length ? raw.split(/\s+/) : [""];
  const lines = [];
  let hyphenated = false;
  let fits = true;
  let current = "";

  const width = (value) => measure(value, size);

  function takeChunks(word) {
    if (width(word) <= maxWidth) return [word];
    hyphenated = true;
    const chunks = [];
    let rest = word;
    while (rest.length > 0) {
      if (width(rest) <= maxWidth) {
        chunks.push(rest);
        break;
      }
      let cut = rest.length - 1;
      while (cut > 1 && width(`${rest.slice(0, cut)}-`) > maxWidth) cut -= 1;
      const piece = rest.slice(0, Math.max(cut, 1));
      const marked = `${piece}-`;
      if (width(marked) > maxWidth) {
        fits = false;
        chunks.push(rest);
        break;
      }
      chunks.push(marked);
      rest = rest.slice(piece.length);
    }
    return chunks;
  }

  for (const word of words) {
    for (const piece of takeChunks(word)) {
      const trial = current ? `${current} ${piece}` : piece;
      if (width(trial) <= maxWidth) {
        current = trial;
      } else {
        if (current) lines.push(current);
        current = piece;
        if (width(piece) > maxWidth) fits = false;
      }
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return { lines, hyphenated, fits };
}

export function fitText(text, options) {
  const {
    maxWidth,
    maxHeight,
    measure,
    maxSize = 20,
    minSize = 7,
    lineHeight = 1.15,
    step = 0.5,
  } = options;

  const floor = Math.min(maxSize, minSize);
  for (let size = maxSize; size >= floor - 1e-9; size = Math.round((size - step) * 10) / 10) {
    const wrapped = wrapText(text, size, maxWidth, measure);
    const height = wrapped.lines.length * size * lineHeight;
    if (wrapped.fits && height <= maxHeight + 0.05) {
      return { size, lines: wrapped.lines, hyphenated: wrapped.hyphenated, overflow: false };
    }
  }

  const fallback = wrapText(text, floor, maxWidth, measure);
  const height = fallback.lines.length * floor * lineHeight;
  return {
    size: floor,
    lines: fallback.lines,
    hyphenated: fallback.hyphenated,
    overflow: !fallback.fits || height > maxHeight + 0.05,
  };
}

/** One size for every cell, using the smallest size any cell needed. */
export function fitAll(texts, options) {
  const individuals = texts.map((text) => fitText(text, options));
  const size = individuals.length ? Math.min(...individuals.map((item) => item.size)) : options.maxSize ?? 20;
  const lineHeight = options.lineHeight ?? 1.15;
  const cells = texts.map((text) => {
    const wrapped = wrapText(text, size, options.maxWidth, options.measure);
    const height = wrapped.lines.length * size * lineHeight;
    return {
      size,
      lines: wrapped.lines,
      hyphenated: wrapped.hyphenated,
      overflow: !wrapped.fits || height > options.maxHeight + 0.05,
    };
  });
  return { size, cells };
}
