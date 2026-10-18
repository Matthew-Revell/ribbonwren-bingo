import { buildCards } from "../core/cards.js";
import { loadFontBytes, loadLogoBytes, openFontkit } from "../pdf/fonts.js";
import { findImageGraphemes, rasterizeGraphemes } from "../pdf/glyph-fallback.js";
import { fitAll } from "../pdf/fit-text.js";
import { cellBox, cellTextBox, cardFrames, cardSlots, contentRect, maxCellFont, pageDimensions } from "../pdf/layout.js";
import { renderPdf } from "../pdf/render.js";
import { textForMeasure } from "../pdf/glyph-fallback.js";

let fontBytesPromise = null;
let logoBytesPromise = null;

export function loadAssets() {
  fontBytesPromise ||= loadFontBytes();
  logoBytesPromise ||= loadLogoBytes();
  return Promise.all([fontBytesPromise, logoBytesPromise]);
}

export async function measureOverflow({ grid, cardsPerPage, freeSpace, title, showBingoLetters, showAccent, inkSaver, texts, fontBytes }) {
  const fontsReady = fontBytes || (await loadAssets())[0];
  const { PDFDocument } = await import("pdf-lib");
  const { embedFonts } = await import("../pdf/fonts.js");
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf, fontsReady);
  const dim = pageDimensions("letter", cardsPerPage);
  const content = contentRect(cardSlots(dim, cardsPerPage)[0]);
  const frames = cardFrames(content, {
    hasTitle: Boolean(title),
    hasLetters: showBingoLetters && grid === 5,
    hasFreeFooter: false,
    hasAccent: showAccent && !inkSaver,
  });
  const box = cellTextBox(cellBox(frames.grid, 0, grid));
  const font = openFontkit(fontsReady.bold);
  const measured = texts.map((text) => textForMeasure(text, font));
  return fitAll(measured.length ? measured : [""], {
    maxWidth: box.width,
    maxHeight: box.height,
    maxSize: maxCellFont(grid, Number(cardsPerPage)),
    minSize: 7,
    measure: (text, size) => fonts.bold.widthOfTextAtSize(text, size),
  });
}

export async function exportGame(options) {
  const [fontBytes, logoBytes] = await loadAssets();
  const fontkitFont = openFontkit(fontBytes.bold);
  const built = buildCards({
    items: options.items,
    seed: options.seed,
    grid: options.grid,
    freeSpace: options.freeSpace,
    freeSpaceText: options.freeSpaceText,
    count: options.count,
  });
  if (!built.ok) return { ok: false, error: built.error };

  let cards = built.cards;
  if (options.pictures) cards = withPictures(cards, options.pictures, options.freeSpaceText);
  const texts = [];
  for (const card of cards) {
    for (const cell of card.cells) {
      if (cell.text) texts.push(cell.text);
    }
  }
  const missing = findImageGraphemes(texts, fontkitFont);
  const raster = await rasterizeGraphemes(missing);
  const rendered = await renderPdf({
    ...options,
    cards,
    fontBytes,
    logoBytes,
    fontkitFont,
    glyphImages: raster.images,
    items: options.callItems || options.items,
  });
  return { ...rendered, glyphWarnings: raster.failed, cards };
}

function withPictures(cards, pictures, freeSpaceText) {
  return cards.map((card) => ({
    ...card,
    cells: card.cells.map((cell) => {
      if (cell.free) return { ...cell, text: freeSpaceText || "FREE" };
      const picture = pictures[cell.itemIndex];
      if (!picture) return cell;
      return {
        ...cell,
        imageId: picture.id,
        caption: picture.caption || "",
        text: picture.caption || "",
      };
    }),
  }));
}
