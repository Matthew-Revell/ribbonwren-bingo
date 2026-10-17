import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { buildCards } from "../../src/core/cards.js";
import { openFontkit } from "../../src/pdf/fonts.js";
import { findImageGraphemes } from "../../src/pdf/glyph-fallback.js";
import { renderPdf } from "../../src/pdf/render.js";
import { renderLicensePdf } from "../../src/pdf/license.js";
import { findDeliveryIssues } from "../../src/pdf/etsy-safe.js";
import { FREE_FOOTER } from "../../src/ui/messages.js";

const fontBytes = {
  display: readFileSync("public/fonts/DMSerifDisplay-Regular.ttf"),
  regular: readFileSync("public/fonts/Nunito-Regular.ttf"),
  bold: readFileSync("public/fonts/Nunito-Bold.ttf"),
  extraBold: readFileSync("public/fonts/Nunito-ExtraBold.ttf"),
  caveat: readFileSync("public/fonts/Caveat-Bold.ttf"),
};
const logoBytes = {
  "ribbonwren-mark.png": readFileSync("public/img/ribbonwren-mark.png"),
  "ribbonwren-mark-holiday.png": readFileSync("public/img/ribbonwren-mark-holiday.png"),
  "star-gold.png": readFileSync("public/img/star-gold.png"),
  "star-cranberry.png": readFileSync("public/img/star-cranberry.png"),
};
const fontkitFont = openFontkit(fontBytes.bold);

function words(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`);
}

function inspect(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "rwb-"));
  const file = join(dir, "card.pdf");
  writeFileSync(file, bytes);
  const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
  const fonts = execFileSync("pdffonts", [file], { encoding: "utf8" });
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  return { dir, file, info, fonts, text };
}

function pngOf(file, page = 1) {
  const dir = file.replace(/\.pdf$/, "");
  mkdirSync(dir, { recursive: true });
  const prefix = join(dir, `p${page}`);
  execFileSync("pdftoppm", ["-r", "100", "-f", String(page), "-l", String(page), "-png", file, prefix]);
  return PNG.sync.read(readFileSync(`${prefix}-${page}.png`));
}

function pixel(png, xPt, yPt, pageHeight) {
  const scale = 100 / 72;
  const x = Math.min(png.width - 1, Math.max(0, Math.round(xPt * scale)));
  const y = Math.min(png.height - 1, Math.max(0, Math.round((pageHeight - yPt) * scale)));
  const index = (y * png.width + x) * 4;
  return { r: png.data[index], g: png.data[index + 1], b: png.data[index + 2] };
}

function expectColor(actual, hex) {
  const n = parseInt(hex.slice(1), 16);
  const expected = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  for (const channel of ["r", "g", "b"]) {
    expect(Math.abs(actual[channel] - expected[channel]), `${channel} ${JSON.stringify(actual)} vs ${hex}`).toBeLessThanOrEqual(2);
  }
}

function infoValue(info, label) {
  const match = info.match(new RegExp(`^${label}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

async function renderWords(options) {
  const list = options.items;
  const built = buildCards({
    items: list,
    seed: options.seed || "KJ4P-92",
    grid: options.grid || 5,
    freeSpace: options.freeSpace !== false,
    freeSpaceText: options.freeSpaceText || "FREE",
    count: options.count || 1,
  });
  expect(built.ok).toBe(true);
  return renderPdf({
    title: options.title || "Holiday bingo",
    cards: built.cards,
    items: list,
    seed: options.seed || "KJ4P-92",
    themeId: options.themeId || "everyday",
    inkSaver: Boolean(options.inkSaver),
    pageSize: options.pageSize || "letter",
    cardsPerPage: options.cardsPerPage || 1,
    tier: options.tier || "free",
    date: "2026-10-17",
    showBingoLetters: options.showBingoLetters !== false,
    showAccent: options.showAccent !== false,
    audience: options.audience || "public",
    licensedTo: options.licensedTo || "",
    shopUrl: options.shopUrl || "",
    fontBytes,
    logoBytes,
    fontkitFont,
    cardStart: options.cardStart,
    cardEnd: options.cardEnd,
    cardTotal: options.cardTotal,
    includeCallSheet: options.includeCallSheet !== false,
    partNote: options.partNote || "",
    allowWording: Boolean(options.allowWording),
  });
}

describe("pdf cards", () => {
  it("uses exact page sizes, embedded subset fonts, and the call sheet", async () => {
    const list = words(30);
    const letter = await renderWords({ items: list, count: 2, pageSize: "letter" });
    const looked = inspect(letter.bytes);
    expect(looked.info).toMatch(/Page size:\s+612 x 792 pts/);
    expect(looked.info).toMatch(/Pages:\s+3/);
    expect(looked.fonts).not.toMatch(/Helvetica/);
    const fontLines = looked.fonts.split("\n").filter((line) => /yes/.test(line) && !line.startsWith("name"));
    expect(fontLines.length).toBeGreaterThan(0);
    for (const line of fontLines) {
      expect(line).toMatch(/yes\s+yes/);
    }
    for (const word of list) expect(looked.text).toContain(word);
    expect(looked.text).toContain(FREE_FOOTER);
    expect(looked.text).toContain("KJ4P-92");
    expect(looked.text).toContain("Card 01 of 2");
    expect(looked.text).toContain("Call Sheet");
    expect(looked.text).toContain("should measure exactly 1 inch");
    expect(looked.text).toContain("Print at 100% / Actual size");
    expect(Buffer.from(letter.bytes).includes(Buffer.from("/PrintScaling /None"))).toBe(true);

    const a4 = await renderWords({ items: list, count: 1, pageSize: "a4", cardsPerPage: 1 });
    const a4look = inspect(a4.bytes);
    expect(a4look.info).toMatch(/595\.28 x 841\.89/);
    expect(a4look.text).toContain("1 card");
    expect(a4look.text).not.toContain("1 cards");
  });

  it("lays out two cards on a landscape page", async () => {
    const list = words(12);
    const rendered = await renderWords({ items: list, count: 3, grid: 3, freeSpace: true, cardsPerPage: 2, pageSize: "letter" });
    const looked = inspect(rendered.bytes);
    expect(looked.info).toMatch(/Page size:\s+792 x 612 pts/);
    expect(looked.info).toMatch(/Pages:\s+3/);
    const a4 = await renderWords({ items: list, count: 2, grid: 3, freeSpace: true, cardsPerPage: 2, pageSize: "a4" });
    expect(inspect(a4.bytes).info).toMatch(/841\.89 x 595\.28/);
  });

  it("omits the footer on pro and keeps owner files free of links and Pro wording", async () => {
    const list = ["cocoa", "paper crane", "wool blanket", "river stone", "library card", "sunday walk", "honey toast", "ceramic mug", "Noël", "piñata"];
    const pro = await renderWords({ items: list, count: 1, grid: 3, freeSpace: true, tier: "pro", licensedTo: "Sarah" });
    const proLook = inspect(pro.bytes);
    expect(proLook.text).not.toContain(FREE_FOOTER);
    expect(infoValue(proLook.info, "Subject")).toContain("Licensed to Sarah");

    const owner = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      tier: "owner",
      audience: "etsy",
      title: "Holiday bingo",
    });
    const ownerLook = inspect(owner.bytes);
    const meta = ["Title", "Subject", "Keywords", "Author", "Creator", "Producer"]
      .map((label) => infoValue(ownerLook.info, label))
      .join("\n");
    expect(findDeliveryIssues(`${ownerLook.text}\n${meta}`)).toEqual([]);
    expect(ownerLook.text).not.toContain(FREE_FOOTER);
    expect(Buffer.from(owner.bytes).toString("latin1").toLowerCase()).not.toContain("http");
    expect(ownerLook.text).toContain("Noël");
    expect(ownerLook.text).toContain("piñata");

    const again = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      tier: "owner",
      audience: "etsy",
      title: "Holiday bingo",
    });
    expect(inspect(again.bytes).text).toBe(ownerLook.text);
  });

  it("blocks a bare domain in the free-space text or the seed", async () => {
    const list = ["cocoa", "paper crane", "wool blanket", "river stone", "library card", "sunday walk", "honey toast", "ceramic mug"];
    const freeSpace = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      freeSpaceText: "example.com",
      tier: "owner",
      audience: "etsy",
    });
    expect(freeSpace.ok).toBe(false);
    expect(freeSpace.hits.some((hit) => hit.issues.includes("domain"))).toBe(true);
    const seed = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      seed: "shop.example.com",
      tier: "owner",
      audience: "etsy",
    });
    expect(seed.ok).toBe(false);
    const printed = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      seed: "www.example.com/pro",
      tier: "owner",
      audience: "etsy",
      allowWording: true,
    });
    expect(printed.ok).toBe(false);
    expect(printed.error).toBe("etsy-text");
  });

  it("blocks a sales-pitch word unless the owner overrides it", async () => {
    const list = ["cocoa", "paper crane", "wool blanket", "river stone", "library card", "sunday walk", "honey toast", "ceramic mug"];
    const blocked = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      title: "Pro tip",
      tier: "owner",
      audience: "etsy",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe("etsy-wording");
    const allowed = await renderWords({
      items: list,
      count: 1,
      grid: 3,
      freeSpace: true,
      title: "Pro tip",
      tier: "owner",
      audience: "etsy",
      allowWording: true,
    });
    expect(allowed.ok).toBe(true);
    expect(inspect(allowed.bytes).text).toContain("Pro tip");
    const linked = await renderWords({
      items: ["hello@example.com", ...list.slice(1)],
      count: 1,
      grid: 3,
      freeSpace: true,
      tier: "owner",
      audience: "etsy",
      allowWording: true,
    });
    expect(linked.ok).toBe(false);
    expect(linked.error).toBe("etsy-text");
  });

  it("flows 300 call-sheet items onto more than one page", async () => {
    const list = words(300, "item");
    const rendered = await renderWords({ items: list, count: 1, includeCallSheet: true });
    const looked = inspect(rendered.bytes);
    const pages = Number(looked.info.match(/Pages:\s+(\d+)/)[1]);
    expect(pages).toBeGreaterThan(2);
    for (const word of list) expect(looked.text).toContain(word);
  });

  it("draws emoji as images and does not throw", async () => {
    const list = ["cocoa", "paper crane", "wool blanket", "river stone", "library card", "sunday walk", "honey toast", "Noël ★", "piñata ∞"];
    const missing = findImageGraphemes(list, fontkitFont);
    expect(missing.length).toBeGreaterThan(0);
    const glyphImages = new Map(missing.map((char) => [char, logoBytes["star-gold.png"]]));
    const built = buildCards({ items: list, seed: "KJ4P-92", grid: 3, freeSpace: false, count: 1 });
    const rendered = await renderPdf({
      title: "Symbols",
      cards: built.cards,
      items: list,
      seed: "KJ4P-92",
      grid: 3,
      fontBytes,
      logoBytes,
      fontkitFont,
      glyphImages,
      date: "2026-10-17",
      tier: "pro",
      showBingoLetters: false,
    });
    expect(rendered.ok).toBe(true);
    const looked = inspect(rendered.bytes);
    expect(looked.text).toContain("Noël");
    expect(looked.text).toContain("∞");
    expect(looked.text).not.toContain("□");
    const raw = Buffer.from(rendered.bytes).toString("latin1");
    expect(raw).toMatch(/\/Subtype\s*\/Image/);
  });

  it("embeds each picture once and stays under the size budget", async () => {
    const png = logoBytes["star-gold.png"];
    const pictures = Array.from({ length: 9 }, (_, index) => ({
      id: `pic-${index}`,
      bytes: png,
      kind: "png",
      width: 128,
      height: 128,
      caption: `caption ${index + 1}`,
    }));
    const items = pictures.map((picture) => picture.id);
    const one = buildCards({ items, seed: "KJ4P-92", grid: 3, freeSpace: false, count: 1 });
    const many = buildCards({ items, seed: "KJ4P-92", grid: 3, freeSpace: false, count: 8 });
    const withImages = (cards) => cards.map((card) => ({
      ...card,
      cells: card.cells.map((cell) => ({ ...cell, imageId: pictures[cell.itemIndex].id, text: "" })),
    }));
    const callItems = pictures.map((picture) => ({ label: picture.caption, imageId: picture.id }));
    const first = await renderPdf({
      title: "Pictures",
      cards: withImages(one.cards),
      items: callItems,
      pictures,
      seed: "KJ4P-92",
      fontBytes,
      logoBytes,
      fontkitFont,
      date: "2026-10-17",
      tier: "pro",
      showBingoLetters: false,
      showAccent: false,
    });
    const rest = await renderPdf({
      title: "Pictures",
      cards: withImages(many.cards),
      items: callItems,
      pictures,
      seed: "KJ4P-92",
      fontBytes,
      logoBytes,
      fontkitFont,
      date: "2026-10-17",
      tier: "pro",
      showBingoLetters: false,
      showAccent: false,
    });
    expect(rest.bytes.length).toBeLessThan(12 * 1024 * 1024);
    expect(rest.bytes.length - first.bytes.length).toBeLessThan(700 * 1024);
    expect(inspect(rest.bytes).text).toContain("caption 1");
  });

  it("makes 30 cards quickly and keeps 100 word cards under 3 MB", async () => {
    const list = words(40);
    const started = Date.now();
    const thirty = await renderWords({ items: list, count: 30 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(thirty.bytes.length).toBeGreaterThan(1000);
    const hundred = await renderWords({ items: list, count: 100, tier: "pro" });
    expect(hundred.bytes.length).toBeLessThan(3 * 1024 * 1024);
  });

  it("samples theme colors from the rendered page", async () => {
    const cases = [
      { themeId: "everyday", inkSaver: false, page: "#FAF5EC", bar: "#2F5D50", free: "#B8434A", cell: "#FAF5EC" },
      { themeId: "christmas", inkSaver: false, page: "#FFFFFF", bar: "#1F4038", free: "#8E2B35", cell: "#FFFFFF" },
      { themeId: "everyday", inkSaver: true, page: "#FFFFFF", bar: "#FFFFFF", free: "#FFFFFF", cell: "#FFFFFF" },
    ];
    for (const item of cases) {
      const rendered = await renderWords({
        items: words(24),
        count: 1,
        themeId: item.themeId,
        inkSaver: item.inkSaver,
        title: "Bingo",
      });
      const looked = inspect(rendered.bytes);
      const png = pngOf(looked.file, 1);
      const { page, titleBar, freeCell, wordCell, stars } = rendered.guide;
      expectColor(pixel(png, 30, 220, page.height), item.page);
      expectColor(pixel(png, titleBar.x + 8, titleBar.y + titleBar.height / 2, page.height), item.bar);
      expectColor(pixel(png, freeCell.x + 8, freeCell.y + 8, page.height), item.free);
      expectColor(pixel(png, wordCell.x + 8, wordCell.y + 8, page.height), item.cell);
      if (item.themeId === "christmas" && !item.inkSaver) {
        const star = stars[0];
        const center = pixel(png, star.x + star.size / 2, star.y + star.size / 2, page.height);
        expectColor(center, "#C9A24A");
        const gridCenter = pixel(png, wordCell.x + wordCell.width / 2, wordCell.y + wordCell.height / 2, page.height);
        expect(gridCenter).not.toEqual(center);
      }
    }
  });
});

describe("font weight", () => {
  it("embeds Nunito Bold at weight 700, heavier than Regular", async () => {
    expect(fontkit.create(fontBytes.bold)["OS/2"].usWeightClass).toBe(700);
    expect(fontkit.create(fontBytes.regular)["OS/2"].usWeightClass).toBe(400);
    expect(fontkit.create(fontBytes.extraBold)["OS/2"].usWeightClass).toBe(800);
    expect(fontkit.create(fontBytes.caveat)["OS/2"].usWeightClass).toBe(700);

    async function ink(bytes) {
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(bytes, { subset: true });
      const page = pdf.addPage([220, 220]);
      page.drawText("H", { x: 30, y: 40, size: 140, font, color: rgb(0, 0, 0) });
      const saved = await pdf.save();
      const looked = inspect(saved);
      const png = pngOf(looked.file, 1);
      let dark = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i] < 80) dark += 1;
      }
      return dark;
    }
    const regular = await ink(fontBytes.regular);
    const bold = await ink(fontBytes.bold);
    expect(bold).toBeGreaterThan(regular * 1.15);
  });
});

describe("license pdf", () => {
  it("includes the buyer, the code, and the unlock link", async () => {
    const license = await renderLicensePdf({
      name: "Sarah",
      order: "WEB-1001",
      codeId: "RW-7K3D9Q",
      code: "abc.def",
      fontBytes,
      logoBytes: logoBytes["ribbonwren-mark.png"],
    });
    const looked = inspect(license.bytes);
    expect(looked.text).toContain("Sarah");
    expect(looked.text).toContain("WEB-1001");
    expect(looked.text).toContain("RW-7K3D9Q");
    expect(looked.text).toContain("abc.def");
    expect(looked.text).toContain("https://");
    expect(looked.text.toLowerCase()).not.toContain("etsy");
    expect(looked.info).toMatch(/Pages:\s+1/);
  });
});
