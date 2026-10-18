export const MARGIN = 36;
export const CHECK_INCH = 72;

export const PAGE = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

export function pageDimensions(pageSize, cardsPerPage) {
  const base = PAGE[pageSize] || PAGE.letter;
  if (Number(cardsPerPage) === 2) {
    return { width: base.height, height: base.width, landscape: true, name: pageSize };
  }
  return { width: base.width, height: base.height, landscape: false, name: pageSize };
}

export function cardSlots(dim, cardsPerPage) {
  if (Number(cardsPerPage) !== 2) {
    return [{ x: 0, y: 0, width: dim.width, height: dim.height }];
  }
  const half = dim.width / 2;
  return [
    { x: 0, y: 0, width: half, height: dim.height },
    { x: half, y: 0, width: half, height: dim.height },
  ];
}

export function contentRect(slot) {
  return {
    x: slot.x + MARGIN,
    y: slot.y + MARGIN,
    width: slot.width - MARGIN * 2,
    height: slot.height - MARGIN * 2,
  };
}

/**
 * Frames inside one card's printable area, from the top of the content box
 * down. `content.y` is the bottom of the box (PDF coordinates).
 */
export function cardFrames(content, flags) {
  const frames = {};
  let top = content.y + content.height;

  if (flags.hasTitle) {
    const height = 40;
    top -= height;
    frames.title = { x: content.x, y: top, width: content.width, height };
    top -= 8;
  }
  if (flags.hasLetters) {
    const height = 20;
    top -= height;
    frames.letters = { x: content.x, y: top, width: content.width, height };
    top -= 4;
  }

  const footerHeight = flags.hasFreeFooter ? 28 : 16;
  frames.footer = { x: content.x, y: content.y, width: content.width, height: footerHeight };
  let bottom = content.y + footerHeight + 4;
  if (flags.hasAccent) {
    const height = 18;
    frames.accent = { x: content.x, y: bottom, width: content.width, height };
    bottom += height + 2;
  }

  const spaceH = top - bottom;
  const grid = Math.max(36, Math.min(content.width, spaceH));
  frames.grid = {
    x: content.x + (content.width - grid) / 2,
    y: bottom + Math.max(0, (spaceH - grid) / 2),
    width: grid,
    height: grid,
  };
  return frames;
}

/** Stars sit in the outer margin so they cannot land on the grid. */
export function starPositions(pageWidth, pageHeight) {
  const s = 22;
  return [
    { x: 6, y: pageHeight - s - 6, size: s, color: "gold" },
    { x: pageWidth - s - 8, y: pageHeight - s - 10, size: s, color: "cranberry" },
    { x: 8, y: 8, size: s, color: "cranberry" },
    { x: pageWidth - s - 6, y: 10, size: s, color: "gold" },
    { x: pageWidth / 2 - s / 2, y: pageHeight - s - 4, size: s, color: "gold" },
    { x: 4, y: pageHeight / 2, size: s, color: "cranberry" },
    { x: pageWidth - s - 4, y: pageHeight / 2 - 30, size: s, color: "gold" },
  ];
}

export function cellBox(grid, index, n) {
  const size = grid.width / n;
  const col = index % n;
  const row = Math.floor(index / n);
  // Row 0 is the top of the grid.
  return {
    x: grid.x + col * size,
    y: grid.y + grid.height - (row + 1) * size,
    width: size,
    height: size,
    row,
    col,
  };
}

export function cellTextBox(cell, { caption = false } = {}) {
  const pad = Math.max(4, cell.width * 0.08);
  const captionH = caption ? cell.height * 0.24 : 0;
  return {
    x: cell.x + pad,
    y: cell.y + pad + captionH,
    width: cell.width - pad * 2,
    height: Math.max(8, cell.height - pad * 2 - captionH),
  };
}

export function maxCellFont(gridSize, perPage) {
  if (perPage === 2) {
    if (gridSize <= 3) return 18;
    if (gridSize === 4) return 14;
    return 12;
  }
  if (gridSize <= 3) return 26;
  if (gridSize === 4) return 20;
  return 16;
}

/**
 * Call-sheet pagination. `rowHeights` are already measured.
 * Returns pages of { index, x, y, w, h } in PDF coordinates, plus the
 * 1-inch check square. Rectangles on a page do not overlap.
 */
export function paginateCallSheet({
  rowHeights,
  pageWidth,
  pageHeight,
  margin = MARGIN,
  headerHeight = 86,
  footerReserve = 108,
}) {
  const cols = pageWidth > 700 ? 3 : 2;
  const gap = 14;
  const colW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const usable = pageHeight - margin - headerHeight - footerReserve;
  const pages = [];
  let index = 0;
  while (index < rowHeights.length) {
    const columns = Array.from({ length: cols }, () => []);
    for (let col = 0; col < cols && index < rowHeights.length; col++) {
      let used = 0;
      while (index < rowHeights.length) {
        const height = rowHeights[index];
        if (columns[col].length > 0 && used + height > usable) break;
        const yTop = pageHeight - margin - headerHeight - used;
        columns[col].push({
          index,
          x: margin + col * (colW + gap),
          y: yTop - height,
          w: colW,
          h: height,
        });
        used += height;
        index += 1;
        if (used >= usable) break;
      }
    }
    pages.push(columns.flat());
  }
  if (pages.length === 0) pages.push([]);
  return {
    pages,
    cols,
    colW,
    check: { x: margin, y: margin, size: CHECK_INCH },
  };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
