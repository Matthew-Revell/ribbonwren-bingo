import { PDFDocument, PDFName, rgb } from "pdf-lib";
import { getLimits } from "../core/limits.js";
import { FREE_FOOTER } from "../ui/messages.js";
import { layoutCallSheet } from "./call-sheet.js";
import { embedFonts } from "./fonts.js";
import { fitAll, fitText } from "./fit-text.js";
import { callLabel, textForMeasure, tokenize } from "./glyph-fallback.js";
import { containRect } from "./images.js";
import {
  cardFrames,
  cardSlots,
  cellBox,
  cellTextBox,
  contentRect,
  maxCellFont,
  pageDimensions,
  starPositions,
} from "./layout.js";
import { scrubMeta, deliveryIssuesIn, partitionDeliveryHits } from "./etsy-safe.js";
import { resolveTheme } from "../themes/index.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatLongDate(iso) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function paint(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function applyMetadata(pdf, { audience, title, licensedTo }) {
  const safeTitle = scrubMeta(title).slice(0, 120) || "Bingo cards";
  pdf.setTitle(safeTitle);
  pdf.setAuthor("Ribbonwren Paper Co.");
  pdf.setCreator("Ribbonwren Paper Co.");
  pdf.setProducer("Ribbonwren Bingo");
  if (audience === "etsy") {
    pdf.setSubject("Printable bingo cards");
    pdf.setKeywords(["bingo", "printable"]);
    return;
  }
  if (licensedTo) pdf.setSubject(`Licensed to ${scrubMeta(licensedTo)}`);
  else pdf.setSubject("Printable bingo cards");
  pdf.setKeywords(["bingo"]);
}

function setPrintScaling(pdf) {
  pdf.catalog.set(
    PDFName.of("ViewerPreferences"),
    pdf.context.obj({ PrintScaling: PDFName.of("None") }),
  );
}

function drawCentered(page, font, lines, size, box, color) {
  const lineHeight = size * 1.15;
  const block = Math.max(lineHeight, lines.length * lineHeight);
  const top = box.y + (box.height + block) / 2;
  lines.forEach((line, index) => {
    if (!line) return;
    const width = font.widthOfTextAtSize(line, size);
    const x = box.x + Math.max(0, (box.width - width) / 2);
    const baseline = top - index * lineHeight - size * 0.78;
    page.drawText(line, { x, y: baseline, size, font, color });
  });
}

function splitWide(token, size, maxWidth, font) {
  if (token.type !== "text" || token.text === " ") return [token];
  if (font.widthOfTextAtSize(token.text, size) <= maxWidth) return [token];
  const pieces = [];
  let rest = token.text;
  while (rest) {
    if (font.widthOfTextAtSize(rest, size) <= maxWidth) {
      pieces.push({ type: "text", text: rest });
      break;
    }
    let cut = rest.length - 1;
    while (cut > 1 && font.widthOfTextAtSize(`${rest.slice(0, cut)}-`, size) > maxWidth) cut -= 1;
    const piece = rest.slice(0, Math.max(cut, 1));
    if (font.widthOfTextAtSize(`${piece}-`, size) > maxWidth) {
      pieces.push({ type: "text", text: rest });
      break;
    }
    pieces.push({ type: "text", text: `${piece}-` });
    rest = rest.slice(piece.length);
  }
  return pieces;
}

function layoutTokenLines(tokens, size, maxWidth, font) {
  const expanded = tokens.flatMap((token) => splitWide(token, size, maxWidth, font));
  const lines = [];
  let line = [];
  let used = 0;
  const widthOf = (token) => {
    if (token.type === "img") return size;
    if (token.text === " ") return font.widthOfTextAtSize(" ", size);
    return font.widthOfTextAtSize(token.text, size);
  };
  const commit = () => {
    while (line.length && line[line.length - 1].type === "text" && line[line.length - 1].text === " ") {
      line.pop();
    }
    if (line.length) lines.push(line);
    line = [];
    used = 0;
  };
  for (const token of expanded) {
    if (token.type === "text" && token.text === " ") {
      if (!line.length) continue;
      line.push(token);
      used += widthOf(token);
      continue;
    }
    const width = widthOf(token);
    if (line.length && used + width > maxWidth + 0.25) commit();
    line.push(token);
    used += width;
  }
  commit();
  return lines.length ? lines : [[]];
}

function strokeStar(page, cx, cy, radius, color) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  for (let i = 0; i < points.length; i++) {
    page.drawLine({
      start: points[i],
      end: points[(i + 1) % points.length],
      thickness: 1.1,
      color,
    });
  }
}

function cardId(seed, number, total) {
  const width = Math.max(2, String(total).length);
  return `Game ${seed} · Card ${String(number).padStart(width, "0")} of ${total}`;
}

function cardsLabel(total) {
  const count = Number(total) || 0;
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * Build the card PDF plus the call sheet.
 * audience "etsy" refuses web addresses, emails, and links, including in
 * the document info dictionary. Words such as Pro can be printed only when
 * allowWording is set. The free footer stays off for that audience.
 */
export async function renderPdf(options) {
  const {
    title = "",
    cards,
    items = [],
    themeId = "everyday",
    inkSaver = false,
    pageSize = "letter",
    cardsPerPage = 1,
    tier = "free",
    seed = "",
    freeSpaceText = "",
    date = "",
    showBingoLetters = false,
    showAccent = true,
    audience = "public",
    licensedTo = "",
    shopUrl = "",
    fontBytes,
    logoBytes = {},
    glyphImages = new Map(),
    pictures = [],
    fontkitFont = null,
    cardStart = 0,
    cardEnd = null,
    cardTotal = null,
    includeCallSheet = true,
    partNote = "",
    allowWording = false,
    onProgress = null,
  } = options;

  const safeItems = Array.isArray(items) ? items : [];
  const safePictures = Array.isArray(pictures) ? pictures : [];
  const labels = safeItems.map((item) => (typeof item === "string" ? item : item.label));
  const pictureById = new Map(safePictures.map((picture) => [picture.id, picture]));
  if (audience === "etsy") {
    const cellTexts = [];
    for (const card of cards || []) {
      for (const cell of card?.cells || []) {
        if (cell?.text) cellTexts.push(cell.text);
      }
    }
    const hits = deliveryIssuesIn([title, freeSpaceText, seed, ...cellTexts, ...labels, partNote]);
    const parts = partitionDeliveryHits(hits);
    if (parts.hard.length) return { ok: false, error: "etsy-text", hits: parts.hard };
    if (parts.soft.length && !allowWording) return { ok: false, error: "etsy-wording", hits: parts.soft };
  }

  const theme = resolveTheme(themeId, inkSaver);
  const limits = getLimits(tier);
  const showFooter = Boolean(limits.footer) && audience !== "etsy";
  const dim = pageDimensions(pageSize, cardsPerPage);
  const slots = cardSlots(dim, cardsPerPage);
  const fullTotal = cardTotal || cards.length;
  const slice = cards.slice(cardStart, cardEnd == null ? cards.length : cardEnd);
  const gridN = Math.round(Math.sqrt(slice[0]?.cells.length || cards[0]?.cells.length || 25));
  const lettersOn = showBingoLetters && gridN === 5;
  const accentOn = showAccent && Boolean(theme.accent);

  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf, fontBytes);
  const measure = (text, size) => fonts.bold.widthOfTextAtSize(text, size);
  const warnings = [];

  const embedded = new Map();
  async function embedRaster(id, bytes, kind) {
    if (!bytes) return null;
    if (embedded.has(id)) return embedded.get(id);
    try {
      const image = kind === "jpg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      embedded.set(id, image);
      return image;
    } catch {
      warnings.push(`image:${id}`);
      return null;
    }
  }

  const markName = theme.mark;
  const markImage = markName && logoBytes[markName] ? await embedRaster(markName, logoBytes[markName], "png") : null;
  const starGold = logoBytes["star-gold.png"] ? await embedRaster("star-gold", logoBytes["star-gold.png"], "png") : null;
  const starBerry = logoBytes["star-cranberry.png"]
    ? await embedRaster("star-cranberry", logoBytes["star-cranberry.png"], "png")
    : null;

  const glyphCache = new Map();
  async function glyphImage(char) {
    if (glyphCache.has(char)) return glyphCache.get(char);
    const bytes = glyphImages.get?.(char) || glyphImages[char];
    const image = bytes ? await embedRaster(`glyph:${char}`, bytes, "png") : null;
    if (!image) warnings.push(`glyph:${char}`);
    glyphCache.set(char, image);
    return image;
  }

  const sampleSlot = contentRect(slots[0]);
  const sampleFrames = cardFrames(sampleSlot, {
    hasTitle: Boolean(title),
    hasLetters: lettersOn,
    hasFreeFooter: showFooter,
    hasAccent: accentOn,
  });
  const sampleCell = cellBox(sampleFrames.grid, 0, gridN);
  const sampleTextBox = cellTextBox(sampleCell);
  const pool = [];
  const seenPool = new Set();
  for (const card of slice) {
    for (const cell of card.cells) {
      if (cell.free || cell.imageId) continue;
      if (seenPool.has(cell.text)) continue;
      seenPool.add(cell.text);
      pool.push(textForMeasure(cell.text, fontkitFont));
    }
  }
  const fitted = fitAll(pool.length ? pool : [""], {
    maxWidth: sampleTextBox.width,
    maxHeight: sampleTextBox.height,
    measure,
    maxSize: maxCellFont(gridN, Number(cardsPerPage)),
    minSize: 7,
    lineHeight: 1.15,
  });
  const cellSize = fitted.size;
  if (fitted.cells.some((cell) => cell.overflow)) warnings.push("overflow");

  let guide = null;
  const perPage = slots.length;
  const pageCount = Math.ceil(slice.length / perPage) || 1;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([dim.width, dim.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: dim.width,
      height: dim.height,
      color: paint(theme.page),
    });
    if (theme.stars) {
      for (const star of starPositions(dim.width, dim.height)) {
        const image = star.color === "gold" ? starGold : starBerry;
        if (!image) continue;
        page.drawImage(image, { x: star.x, y: star.y, width: star.size, height: star.size });
      }
    }
    if (Number(cardsPerPage) === 2) {
      page.drawLine({
        start: { x: dim.width / 2, y: 20 },
        end: { x: dim.width / 2, y: dim.height - 20 },
        thickness: 1.1,
        color: paint("#E8D9C0"),
        dashArray: [5, 4],
      });
    }
    if (partNote && pageIndex === 0) {
      page.drawText(partNote, {
        x: 36,
        y: 16,
        size: 8,
        font: fonts.regular,
        color: paint("#2B2A33"),
      });
    }

    for (let slotIndex = 0; slotIndex < perPage; slotIndex++) {
      const card = slice[pageIndex * perPage + slotIndex];
      if (!card) break;
      const content = contentRect(slots[slotIndex]);
      const frames = cardFrames(content, {
        hasTitle: Boolean(title),
        hasLetters: lettersOn,
        hasFreeFooter: showFooter,
        hasAccent: accentOn,
      });
      if (!guide && pageIndex === 0 && slotIndex === 0) {
        const free = card.cells.find((cell) => cell.free);
        const word = card.cells.find((cell) => !cell.free);
        guide = {
          page: { width: dim.width, height: dim.height },
          background: theme.page,
          titleBar: frames.title || null,
          grid: frames.grid,
          freeCell: free ? cellBox(frames.grid, free.row * gridN + free.col, gridN) : null,
          wordCell: word ? cellBox(frames.grid, word.row * gridN + word.col, gridN) : null,
          stars: theme.stars ? starPositions(dim.width, dim.height) : [],
          inkSaver: theme.inkSaver,
        };
      }
      await drawCard({
        page,
        card,
        title,
        frames,
        theme,
        fonts,
        gridN,
        cellSize,
        fontkitFont,
        glyphImage,
        pictureById,
        embedRaster,
        markImage,
        seed,
        total: fullTotal,
        showFooter,
        shopUrl: showFooter ? shopUrl : "",
        accentOn,
        lettersOn,
      });
      if (onProgress) {
        const done = pageIndex * perPage + slotIndex + 1;
        onProgress({ done, total: slice.length });
        if (done % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  if (includeCallSheet) {
    const callLabels = safeItems.map((item) => {
      if (typeof item === "string") return callLabel(item, fontkitFont);
      return {
        label: callLabel(item.label || item.caption || "Picture", fontkitFont),
        imageId: item.imageId || null,
      };
    });
    const call = layoutCallSheet({
      labels: callLabels,
      pageWidth: dim.width,
      pageHeight: dim.height,
      measure: (text, size) => fonts.regular.widthOfTextAtSize(text, size),
    });
    const header = `Seed ${seed}  ·  ${cardsLabel(fullTotal)}  ·  ${gridN}×${gridN}  ·  ${formatLongDate(date)}`;
    for (let index = 0; index < call.pages.length; index++) {
      const rows = call.pages[index];
      const page = pdf.addPage([dim.width, dim.height]);
      page.drawRectangle({ x: 0, y: 0, width: dim.width, height: dim.height, color: rgb(1, 1, 1) });
      const heading = `Call Sheet · ${title || "Bingo"}`;
      const headingFit = fitText(heading, {
        maxWidth: dim.width - 72,
        maxHeight: 28,
        maxSize: 22,
        minSize: 12,
        measure: (text, size) => fonts.display.widthOfTextAtSize(text, size),
      });
      page.drawText(headingFit.lines[0] || heading, {
        x: 36,
        y: dim.height - 58,
        size: headingFit.size,
        font: fonts.display,
        color: paint("#2F5D50"),
      });
      page.drawText(header, {
        x: 36,
        y: dim.height - 78,
        size: 10,
        font: fonts.regular,
        color: paint("#2B2A33"),
      });
      if (call.pages.length > 1) {
        page.drawText(`Page ${index + 1} of ${call.pages.length}`, {
          x: dim.width - 120,
          y: dim.height - 78,
          size: 9,
          font: fonts.regular,
          color: paint("#2B2A33"),
        });
      }
      for (const row of rows) {
        const layout = call.rows[row.index];
        const imageId = layout?.imageId;
        if (imageId && pictureById.get(imageId)) {
          const thumb = await embedRaster(
            pictureById.get(imageId).id,
            pictureById.get(imageId).bytes,
            pictureById.get(imageId).kind,
          );
          if (thumb) {
            page.drawImage(thumb, { x: row.x, y: row.y + row.h - 13, width: 11, height: 11 });
          }
        } else {
          page.drawRectangle({
            x: row.x,
            y: row.y + row.h - 12,
            width: 9,
            height: 9,
            borderColor: paint("#2B2A33"),
            borderWidth: 0.8,
            color: rgb(1, 1, 1),
          });
        }
        layout.lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: row.x + 14,
            y: row.y + row.h - 12 - lineIndex * layout.size * 1.15,
            size: layout.size,
            font: fonts.regular,
            color: paint("#2B2A33"),
          });
        });
      }
      const check = call.check;
      page.drawRectangle({
        x: check.x,
        y: check.y,
        width: check.size,
        height: check.size,
        borderColor: paint("#2B2A33"),
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      });
      page.drawText("This square should measure exactly 1 inch.", {
        x: check.x + check.size + 12,
        y: check.y + 40,
        size: 11,
        font: fonts.bold,
        color: paint("#2B2A33"),
      });
      page.drawText("Print at 100% / Actual size, not Fit to page.", {
        x: check.x + check.size + 12,
        y: check.y + 22,
        size: 11,
        font: fonts.regular,
        color: paint("#2B2A33"),
      });
    }
  }

  applyMetadata(pdf, { audience, title, licensedTo: audience === "etsy" ? "" : licensedTo });
  setPrintScaling(pdf);
  const bytes = await pdf.save({ useObjectStreams: false });
  return { ok: true, bytes: new Uint8Array(bytes), warnings, guide, fontSize: cellSize };
}

export { renderPdf as renderPdfDocument };

async function drawCard(ctx) {
  const {
    page, card, title, frames, theme, fonts, gridN, cellSize, fontkitFont, glyphImage,
    pictureById, embedRaster, markImage, seed, total, showFooter, shopUrl, accentOn, lettersOn,
  } = ctx;
  const textColor = paint(theme.text);

  if (frames.title && theme.titleBar) {
    page.drawRectangle({ ...frames.title, color: paint(theme.titleBar) });
  }
  if (frames.title) {
    const fit = fitText(title || "", {
      maxWidth: frames.title.width - 16,
      maxHeight: frames.title.height - 8,
      maxSize: 22,
      minSize: 11,
      measure: (text, size) => fonts.display.widthOfTextAtSize(text, size),
    });
    drawCentered(
      page,
      fonts.display,
      fit.lines,
      fit.size,
      frames.title,
      paint(theme.titleText),
    );
    if (theme.rule) {
      page.drawLine({
        start: { x: frames.title.x, y: frames.title.y - 2 },
        end: { x: frames.title.x + frames.title.width, y: frames.title.y - 2 },
        thickness: 2,
        color: paint(theme.rule),
      });
    }
  }

  if (lettersOn && frames.letters) {
    if (theme.letterBg) {
      page.drawRectangle({
        x: frames.grid.x,
        y: frames.letters.y,
        width: frames.grid.width,
        height: frames.letters.height,
        color: paint(theme.letterBg),
      });
    }
    const letters = ["B", "I", "N", "G", "O"];
    const colW = frames.grid.width / 5;
    letters.forEach((letter, index) => {
      const width = fonts.extraBold.widthOfTextAtSize(letter, 13);
      page.drawText(letter, {
        x: frames.grid.x + index * colW + (colW - width) / 2,
        y: frames.letters.y + 4,
        size: 13,
        font: fonts.extraBold,
        color: paint(theme.letterText),
      });
    });
  }

  const cell = frames.grid.width / gridN;
  for (const entry of card.cells) {
    const box = cellBox(frames.grid, entry.row * gridN + entry.col, gridN);
    const fill = entry.free ? theme.freeFill : theme.cellFill;
    if (fill) page.drawRectangle({ ...box, color: paint(fill) });
    if (entry.free && !theme.freeFill) {
      strokeStar(page, box.x + box.width / 2, box.y + box.height / 2, box.width * 0.28, paint(theme.freeText));
    }
  }
  const line = paint(theme.cellLine);
  for (let i = 0; i <= gridN; i++) {
    const x = frames.grid.x + i * cell;
    page.drawLine({
      start: { x, y: frames.grid.y },
      end: { x, y: frames.grid.y + frames.grid.height },
      thickness: theme.cellLineWidth,
      color: line,
    });
    const y = frames.grid.y + i * cell;
    page.drawLine({
      start: { x: frames.grid.x, y },
      end: { x: frames.grid.x + frames.grid.width, y },
      thickness: theme.cellLineWidth,
      color: line,
    });
  }
  if (theme.cornerDots) {
    const dot = paint(theme.cornerDots);
    for (let i = 0; i <= gridN; i++) {
      for (let j = 0; j <= gridN; j++) {
        page.drawCircle({
          x: frames.grid.x + i * cell,
          y: frames.grid.y + j * cell,
          size: 1.35,
          color: dot,
        });
      }
    }
  }

  for (const entry of card.cells) {
    const box = cellBox(frames.grid, entry.row * gridN + entry.col, gridN);
    if (entry.imageId) {
      await drawPicture(page, box, pictureById.get(entry.imageId), fonts, textColor, embedRaster);
      continue;
    }
    const captionRoom = entry.free && markImage ? box.height * 0.22 : 0;
    const textBox = cellTextBox(
      { ...box, height: box.height - captionRoom, y: box.y + captionRoom },
      {},
    );
    const tokens = tokenize(entry.text, fontkitFont);
    const lines = layoutTokenLines(tokens, entry.free ? Math.min(cellSize + 2, 18) : cellSize, textBox.width, entry.free ? fonts.extraBold : fonts.bold);
    await drawTokenLines(
      page,
      lines,
      entry.free ? fonts.extraBold : fonts.bold,
      entry.free ? Math.min(Math.max(cellSize, 12), 20) : cellSize,
      textBox,
      paint(entry.free ? theme.freeText : theme.text),
      glyphImage,
    );
    if (entry.free && markImage) {
      const side = Math.min(18, box.width * 0.22);
      page.drawImage(markImage, {
        x: box.x + (box.width - side) / 2,
        y: box.y + 4,
        width: side,
        height: side,
      });
    }
  }

  if (accentOn && frames.accent) {
    const lineText = "Good luck!";
    const width = fonts.caveat.widthOfTextAtSize(lineText, 14);
    page.drawText(lineText, {
      x: frames.accent.x + (frames.accent.width - width) / 2,
      y: frames.accent.y + 3,
      size: 14,
      font: fonts.caveat,
      color: paint(theme.accent),
    });
  }

  const id = cardId(seed, card.number, total);
  page.drawText(id, {
    x: frames.footer.x,
    y: frames.footer.y + (showFooter ? 14 : 2),
    size: 8,
    font: fonts.regular,
    color: textColor,
  });
  if (showFooter) {
    const footer = shopUrl ? `${FREE_FOOTER} · ${shopUrl}` : FREE_FOOTER;
    const fit = fitText(footer, {
      maxWidth: frames.footer.width - (markImage ? 16 : 0),
      maxHeight: 12,
      maxSize: 8,
      minSize: 6,
      measure: (text, size) => fonts.regular.widthOfTextAtSize(text, size),
    });
    page.drawText(fit.lines[0] || footer, {
      x: frames.footer.x,
      y: frames.footer.y + 2,
      size: fit.size,
      font: fonts.regular,
      color: textColor,
    });
  }
  if (markImage && !theme.inkSaver) {
    page.drawImage(markImage, {
      x: frames.footer.x + frames.footer.width - 14,
      y: frames.footer.y + 1,
      width: 12,
      height: 12,
    });
  }
}

async function drawTokenLines(page, lines, font, size, box, color, glyphImage) {
  const lineHeight = size * 1.15;
  const block = Math.max(lineHeight, lines.length * lineHeight);
  const top = box.y + (box.height + block) / 2;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let width = 0;
    for (const token of line) {
      width += token.type === "img" ? size : font.widthOfTextAtSize(token.text, size);
    }
    let x = box.x + Math.max(0, (box.width - width) / 2);
    const baseline = top - index * lineHeight - size * 0.78;
    for (const token of line) {
      if (token.type === "img") {
        const image = await glyphImage(token.text);
        if (image) {
          page.drawImage(image, { x, y: baseline - size * 0.15, width: size, height: size });
        }
        x += size;
      } else if (token.text && token.text !== " ") {
        page.drawText(token.text, { x, y: baseline, size, font, color });
        x += font.widthOfTextAtSize(token.text, size);
      } else if (token.text === " ") {
        x += font.widthOfTextAtSize(" ", size);
      }
    }
  }
}

async function drawPicture(page, box, picture, fonts, color, embedRaster) {
  if (!picture) return;
  const caption = String(picture.caption || "").trim();
  const pad = box.width * 0.08;
  const captionH = caption ? box.height * 0.22 : 0;
  const frame = {
    x: box.x + pad,
    y: box.y + pad + captionH,
    width: box.width - pad * 2,
    height: box.height - pad * 2 - captionH,
  };
  const image = await embedRaster(picture.id, picture.bytes, picture.kind);
  if (image) {
    const fitted = containRect(image.width, image.height, frame.width, frame.height);
    page.drawImage(image, {
      x: frame.x + fitted.x,
      y: frame.y + fitted.y,
      width: fitted.width,
      height: fitted.height,
    });
  }
  if (caption) {
    const fit = fitText(caption, {
      maxWidth: box.width - pad * 2,
      maxHeight: captionH,
      maxSize: 9,
      minSize: 7,
      measure: (text, size) => fonts.bold.widthOfTextAtSize(text, size),
    });
    page.drawText(fit.lines[0] || caption, {
      x: box.x + pad,
      y: box.y + 4,
      size: fit.size,
      font: fonts.bold,
      color,
    });
  }
}
