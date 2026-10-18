import { describe, expect, it } from "vitest";
import { buildCards } from "../../src/core/cards.js";
import { forceSplitDelimiters, neededCount, parseItems, validateSupply } from "../../src/core/items.js";
import { validateCardCount } from "../../src/core/limits.js";
import { licenseFilename, ownerCardFilename, sanitizeFilename } from "../../src/core/filename.js";
import { fitEdge, MAX_BYTES, MAX_EDGE, MAX_PICTURES, prepareImageFile } from "../../src/pdf/images.js";
import { fitAll, fitText } from "../../src/pdf/fit-text.js";
import { CHECK_INCH, MARGIN, cardSlots, contentRect, pageDimensions, paginateCallSheet, rectsOverlap } from "../../src/pdf/layout.js";
import { deliveryIssuesIn, findDeliveryIssues, partitionDeliveryHits, scrubMeta } from "../../src/pdf/etsy-safe.js";
import { etsyBlockedMessage, wordingWarning } from "../../src/ui/owner-messages.js";
import { recipeError } from "../../src/core/recipe.js";
import { ALGORITHM } from "../../src/core/rng.js";
import { buildDeliveryFiles, splitRanges } from "../../src/pdf/split.js";
import { checkoutHref, purchaseHref, siteConfig } from "../../src/config.js";

const measure = (text, size) => text.length * size * 0.5;

describe("parseItems", () => {
  it("drops blank lines, spaces, tabs, nbsp, and windows newlines", () => {
    const parsed = parseItems("  cocoa\t \r\n\u00a0\r\n\n  paper crane  \r\n   ");
    expect(parsed.items).toEqual(["cocoa", "paper crane"]);
    expect(parsed.duplicates).toEqual([]);
  });

  it("groups case-insensitive duplicates and keeps the first", () => {
    const parsed = parseItems("Elf\nelf \nELF\nmitten");
    expect(parsed.items).toEqual(["Elf", "mitten"]);
    expect(parsed.duplicates).toEqual([{ kept: "Elf", dropped: ["elf", "ELF"] }]);
  });

  it("warns on long items, rtl text, and lists over 500", () => {
    const long = "a".repeat(81);
    const parsed = parseItems(`${long}\nשלום\n${Array.from({ length: 501 }, (_, i) => `item ${i}`).join("\n")}`);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["long-item", "rtl", "many-items"]),
    );
  });

  it("keeps angle brackets as plain text", () => {
    const parsed = parseItems("<script>alert(1)</script>\n<b>hi</b>");
    expect(parsed.items).toEqual(["<script>alert(1)</script>", "<b>hi</b>"]);
  });

  it("splits commas and semicolons when most lines use them", () => {
    expect(parseItems("a, b; c", { mode: "auto" }).items).toEqual(["a", "b", "c"]);
    expect(parseItems("milk, cookies\ncocoa", { mode: "auto" }).items).toEqual(["milk, cookies", "cocoa"]);
    expect(parseItems("a, b", { mode: "lines" }).items).toEqual(["a, b"]);
  });

  it("still splits a comma list that ends with a newline", () => {
    const words = Array.from({ length: 30 }, (_, index) => `word${index}`);
    const parsed = parseItems(`${words.join(", ")}\n`, { mode: "auto" });
    expect(parsed.items).toEqual(words);
  });

  it("splits every line when each line is comma-separated", () => {
    const lines = Array.from({ length: 12 }, (_, index) => `a${index}, b${index}, c${index}`);
    const parsed = parseItems(lines.join("\n"), { mode: "auto" });
    expect(parsed.items).toHaveLength(36);
    expect(parsed.items).toContain("a7");
    expect(parsed.items).toContain("b7");
    expect(parsed.items).toContain("c7");
    expect(parsed.items).not.toContain("a7, b7, c7");
  });

  it("keeps a quoted comma inside one item and drops the quotes", () => {
    expect(parseItems('"milk, cookies"', { mode: "auto" }).items).toEqual(["milk, cookies"]);
    expect(parseItems('tea, "milk, cookies", cocoa', { mode: "auto" }).items).toEqual(["tea", "milk, cookies", "cocoa"]);
    expect(parseItems('"milk, cookies"\ncocoa', { mode: "auto" }).items).toEqual(["milk, cookies", "cocoa"]);
    expect(parseItems('"milk, cookies"', { mode: "lines" }).items).toEqual(["milk, cookies"]);
    expect(parseItems("\u201Cmilk, cookies\u201D", { mode: "auto" }).items).toEqual(["milk, cookies"]);
    expect(parseItems("tea, \u201Cmilk, cookies\u201D, cocoa", { mode: "auto" }).items).toEqual(["tea", "milk, cookies", "cocoa"]);
    expect(parseItems("\u2018milk, cookies\u2019", { mode: "auto" }).items).toEqual(["milk, cookies"]);
    expect(parseItems("tea, \u2018milk, cookies\u2019, cocoa", { mode: "auto" }).items).toEqual(["tea", "milk, cookies", "cocoa"]);
    expect(parseItems("\u2018Santa\u2019s list, cookies\u2019", { mode: "auto" }).items).toEqual(["Santa\u2019s list, cookies"]);
    expect(parseItems("Santa\u2019s hat\ncocoa", { mode: "auto" }).items).toEqual(["Santa\u2019s hat", "cocoa"]);
    expect(parseItems("rock \u2018n\u2019 roll, cocoa", { mode: "auto" }).items).toEqual(["rock \u2018n\u2019 roll", "cocoa"]);
    expect(parseItems("Mom\u2018s cocoa, Santa", { mode: "auto" }).items).toEqual(["Mom\u2018s cocoa", "Santa"]);
  });

  it("treats an unclosed leading curly apostrophe as a plain character", () => {
    expect(parseItems("tea, \u2018tis the season, cocoa", { mode: "auto" }).items).toEqual([
      "tea",
      "\u2018tis the season",
      "cocoa",
    ]);
    expect(parseItems("\u2018twas the night, cocoa", { mode: "auto" }).items).toEqual(["\u2018twas the night", "cocoa"]);
    expect(parseItems("tea; \u2018tis the season; cocoa", { mode: "auto" }).items).toEqual([
      "tea",
      "\u2018tis the season",
      "cocoa",
    ]);
    expect(forceSplitDelimiters("tea, \u2018tis the season, cocoa").split("\n")).toEqual([
      "tea",
      "\u2018tis the season",
      "cocoa",
    ]);
    const warned = parseItems("cocoa\n\u2018tis the season, cocoa\npaper", { mode: "auto" });
    expect(warned.items).toEqual(["cocoa", "\u2018tis the season, cocoa", "paper"]);
    expect(warned.warnings.map((warning) => warning.code)).toContain("comma-item");
  });

  it("warns when a mostly line-based list still has a comma line", () => {
    const raw = ["cocoa", "Snow, Sled, Cocoa, Elf, Mittens", "paper"].join("\n");
    const parsed = parseItems(raw, { mode: "auto" });
    expect(parsed.items).toEqual(["cocoa", "Snow, Sled, Cocoa, Elf, Mittens", "paper"]);
    expect(parsed.warnings.map((warning) => warning.code)).toContain("comma-item");
    expect(parsed.warnings.find((warning) => warning.code === "comma-item").item).toBe("Snow, Sled, Cocoa, Elf, Mittens");
    expect(forceSplitDelimiters(raw).split("\n")).toEqual(["cocoa", "Snow", "Sled", "Cocoa", "Elf", "Mittens", "paper"]);
    const quoted = parseItems('"milk, cookies"\ncocoa\npaper', { mode: "auto" });
    expect(quoted.warnings.map((warning) => warning.code)).not.toContain("comma-item");
  });
});

describe("validateSupply", () => {
  it("covers every grid minimum", () => {
    expect(neededCount(5, true)).toBe(24);
    expect(neededCount(5, false)).toBe(25);
    expect(neededCount(4, false)).toBe(16);
    expect(neededCount(3, true)).toBe(8);
    expect(neededCount(3, false)).toBe(9);
  });

  it("blocks a short list and says how many more", () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`);
    const result = validateSupply(words, { grid: 5, freeSpace: true });
    expect(result.errors[0]).toMatchObject({ code: "too-few", needed: 24, have: 10, more: 14 });
  });

  it("warns on an exact fit and on a short list that still plays", () => {
    const exact = validateSupply(Array.from({ length: 24 }, (_, i) => `w${i}`), { grid: 5, freeSpace: true });
    expect(exact.errors).toEqual([]);
    expect(exact.warnings.map((warning) => warning.code)).toEqual(["exact-fit", "low-variety"]);
    const better = validateSupply(Array.from({ length: 30 }, (_, i) => `w${i}`), { grid: 5, freeSpace: true });
    expect(better.warnings.map((warning) => warning.code)).toEqual(["low-variety"]);
    const plenty = validateSupply(Array.from({ length: 48 }, (_, i) => `w${i}`), { grid: 5, freeSpace: true });
    expect(plenty.warnings).toEqual([]);
  });

  it("refuses a free space on 4×4", () => {
    const result = validateSupply(Array.from({ length: 16 }, (_, i) => `w${i}`), { grid: 4, freeSpace: true });
    expect(result.errors[0].code).toBe("free-space-grid");
  });
});

describe("buildCards", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `word ${i}`);

  it("puts the free space only in the center of odd grids", () => {
    const five = buildCards({ items: words(24), seed: "KJ4P-92", grid: 5, freeSpace: true, count: 1 });
    expect(five.ok).toBe(true);
    expect(five.cards[0].cells[12].free).toBe(true);
    expect(five.cards[0].cells.filter((cell) => cell.free)).toHaveLength(1);
    const three = buildCards({ items: words(8), seed: "KJ4P-92", grid: 3, freeSpace: true, count: 1 });
    expect(three.cards[0].cells[4].free).toBe(true);
    const even = buildCards({ items: words(16), seed: "KJ4P-92", grid: 4, freeSpace: true, count: 1 });
    expect(even.ok).toBe(false);
  });

  it("never repeats an item on one card", () => {
    const built = buildCards({ items: [...words(20), "word 1", "WORD 2"], seed: "ABCD-EF", grid: 4, count: 3 });
    for (const card of built.cards) {
      const labels = card.cells.map((cell) => cell.text.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("makes unique cards for 1, 10, 100, and 500", () => {
    for (const count of [1, 10, 100, 500]) {
      const built = buildCards({ items: words(48), seed: "7K3D-9Q", grid: 5, freeSpace: true, count });
      expect(built.ok).toBe(true);
      const prints = built.cards.map((card) => card.fingerprint);
      expect(new Set(prints).size).toBe(count);
    }
  });

  it("stays unique when every card uses the same 24 words", () => {
    const built = buildCards({ items: words(24), seed: "KJ4P-92", grid: 5, freeSpace: true, count: 100 });
    expect(built.ok).toBe(true);
    expect(new Set(built.cards.map((card) => card.fingerprint)).size).toBe(100);
  });

  it("reprints the same cards and changes when one word changes", () => {
    const first = buildCards({ items: words(30), seed: "KJ4P-92", grid: 5, freeSpace: true, count: 4 });
    const second = buildCards({ items: words(30), seed: "KJ4P-92", grid: 5, freeSpace: true, count: 4 });
    expect(second.cards.map((card) => card.fingerprint)).toEqual(first.cards.map((card) => card.fingerprint));
    const changed = words(30);
    changed[3] = "different word";
    const third = buildCards({ items: changed, seed: "KJ4P-92", grid: 5, freeSpace: true, count: 4 });
    expect(third.cards[0].fingerprint).not.toBe(first.cards[0].fingerprint);
  });
});

describe("limits", () => {
  it("caps free at 10 and pro at 500", () => {
    expect(validateCardCount("free", 11)).toMatchObject({ ok: false, code: "over-cap", max: 10 });
    expect(validateCardCount("free", 10).ok).toBe(true);
    expect(validateCardCount("pro", 500).ok).toBe(true);
    expect(validateCardCount("pro", 501)).toMatchObject({ ok: false, code: "over-cap" });
    expect(validateCardCount("owner", 500).ok).toBe(true);
  });

  it("rejects zero, negatives, decimals, and words", () => {
    for (const value of [0, -3, 1.5, "abc", "", "10.2", "1e2"]) {
      expect(validateCardCount("free", value).ok).toBe(false);
    }
  });
});

describe("filenames", () => {
  it("strips unsafe characters, emoji, and leading dots, and caps length", () => {
    expect(sanitizeFilename('..hello/world:file*?"<>|🎄.pdf')).toBe("helloworldfile.pdf");
    const long = `${"a".repeat(200)}.pdf`;
    const safe = sanitizeFilename(long);
    expect(safe.length).toBeLessThanOrEqual(120);
    expect(safe.endsWith(".pdf")).toBe(true);
  });

  it("builds owner names within 70 safe characters", () => {
    const name = ownerCardFilename({ order: "3456789012", count: 30, pageSize: "letter" });
    expect(name).toBe("RW-Bingo_3456789012_30c_Letter.pdf");
    expect(name.length).toBeLessThanOrEqual(70);
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
    const messy = ownerCardFilename({ order: "../3456/789 🎁", count: 4, pageSize: "a4", part: 2 });
    expect(messy).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(messy.length).toBeLessThanOrEqual(70);
    expect(messy.endsWith("_p2.pdf")).toBe(true);
    const huge = ownerCardFilename({ order: "x".repeat(80), count: 500, pageSize: "letter" });
    expect(huge.length).toBeLessThanOrEqual(70);
    expect(licenseFilename("3456789012")).toBe("ribbonwren-bingo-license-3456789012.pdf");
  });

  it("folds accents, drops flags and joiners, and collapses stray separators", () => {
    expect(sanitizeFilename("Café.pdf")).toBe("Cafe.pdf");
    expect(sanitizeFilename("hello--world__x.pdf")).toBe("hello-world-x.pdf");
    expect(sanitizeFilename("🇺🇸party.pdf")).toBe("party.pdf");
    expect(sanitizeFilename("na\u200dme.pdf")).toBe("name.pdf");
    expect(sanitizeFilename("hello\u{1F44D}\u{1F3FD}.pdf")).toBe("hello.pdf");
    expect(sanitizeFilename("wave\u{1F3FD}.pdf")).toBe("wave.pdf");
    expect(sanitizeFilename("-_hello_-.pdf")).toBe("hello.pdf");
    const named = ownerCardFilename({ order: "Café--party", count: 1, pageSize: "letter" });
    expect(named).toBe("RW-Bingo_Cafe-party_1c_Letter.pdf");
    expect(named.length).toBeLessThanOrEqual(70);
    expect(named).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("pictures", () => {
  it("shrinks a long edge and rejects a photo over 20 MB", async () => {
    expect(MAX_PICTURES).toBe(75);
    expect(MAX_EDGE).toBe(600);
    expect(fitEdge(4000, 2000)).toEqual({ width: 600, height: 300 });
    const big = await prepareImageFile({ size: MAX_BYTES + 1, name: "huge.png", type: "image/png" });
    expect(big.error).toBe("too-big");
  });
});

describe("fitText", () => {
  it("hyphenates a very long word and keeps a 7pt floor", () => {
    const long = fitText("Supercalifragilisticexpialidocious", {
      maxWidth: 80,
      maxHeight: 200,
      measure,
      maxSize: 20,
      minSize: 7,
    });
    expect(long.hyphenated).toBe(true);
    expect(long.overflow).toBe(false);
    expect(long.size).toBeGreaterThanOrEqual(7);
    const tiny = fitText("Hello", { maxWidth: 1, maxHeight: 1, measure, maxSize: 20, minSize: 7 });
    expect(tiny.size).toBe(7);
    expect(tiny.overflow).toBe(true);
  });

  it("wraps a phrase and uses one size for every cell", () => {
    const phrase = fitText("one two three four five six seven eight nine ten", {
      maxWidth: 40,
      maxHeight: 80,
      measure,
      maxSize: 12,
      minSize: 7,
    });
    expect(phrase.lines.length).toBeGreaterThan(1);
    const uniform = fitAll(["A", "one two three four five six seven eight nine ten"], {
      maxWidth: 40,
      maxHeight: 80,
      measure,
      maxSize: 18,
      minSize: 7,
    });
    expect(new Set(uniform.cells.map((cell) => cell.size)).size).toBe(1);
    expect(uniform.size).toBeLessThan(18);
  });
});

describe("layout", () => {
  it("keeps a half-inch margin on both halves of a 2-up page", () => {
    for (const pageSize of ["letter", "a4"]) {
      const dim = pageDimensions(pageSize, 2);
      expect(dim.width).toBeGreaterThan(dim.height);
      for (const slot of cardSlots(dim, 2)) {
        const box = contentRect(slot);
        expect(box.x - slot.x).toBeGreaterThanOrEqual(MARGIN);
        expect(box.y - slot.y).toBeGreaterThanOrEqual(MARGIN);
        expect(slot.x + slot.width - (box.x + box.width)).toBeGreaterThanOrEqual(MARGIN);
        expect(slot.y + slot.height - (box.y + box.height)).toBeGreaterThanOrEqual(MARGIN);
      }
    }
    expect(pageDimensions("letter", 1)).toMatchObject({ width: 612, height: 792 });
    expect(pageDimensions("a4", 1).width).toBeCloseTo(595.28, 2);
    expect(pageDimensions("a4", 1).height).toBeCloseTo(841.89, 2);
  });

  it("places 300 call-sheet rows on several pages without overlap", () => {
    const pages = paginateCallSheet({
      rowHeights: Array.from({ length: 300 }, () => 16),
      pageWidth: 612,
      pageHeight: 792,
    });
    expect(pages.pages.length).toBeGreaterThan(1);
    expect(pages.check.size).toBe(CHECK_INCH);
    let seen = 0;
    for (const page of pages.pages) {
      seen += page.length;
      for (let i = 0; i < page.length; i++) {
        for (let j = i + 1; j < page.length; j++) {
          expect(rectsOverlap(page[i], page[j])).toBe(false);
        }
      }
    }
    expect(seen).toBe(300);
  });
});

describe("delivery rules", () => {
  it("flags links and Pro wording, and Get Pro points at the test checkout", () => {
    expect(siteConfig.purchaseUrl).toBe("https://ribbonwren.lemonsqueezy.com/checkout/buy/d376910a-cd10-472a-a1bb-539ca3020be7");
    expect(siteConfig.externalCodeType).toBe("lemonsqueezy");
    expect(siteConfig.lemonSqueezy).toEqual({
      storeId: 500556,
      productId: 1449237,
      variantIds: [2262220],
      mode: "test",
    });
    const checkout = siteConfig.purchaseUrl;
    expect(checkout).toContain("d376910a-cd10-472a-a1bb-539ca3020be7");
    expect(purchaseHref()).toBe(checkout);
    expect(checkoutHref({ mode: "test", dev: false, search: "" })).toBe(null);
    expect(checkoutHref({ mode: "test", dev: false, search: "?lstest=0" })).toBe(null);
    expect(checkoutHref({ mode: "test", dev: true })).toBe(checkout);
    expect(checkoutHref({ mode: "test", dev: false, search: "?lstest=1" })).toBe(null);
    expect(checkoutHref({ mode: "test", dev: true, search: "?lstest=1" })).toBe(checkout);
    expect(checkoutHref({ mode: "test", dev: false, search: "?lstest=1", qaBuild: true })).toBe(checkout);
    expect(checkoutHref({ mode: "test", dev: false, search: "", qaBuild: true })).toBe(null);
    expect(checkoutHref({ mode: "live", dev: false })).toBe(checkout);
    expect(checkoutHref({ mode: "live", purchaseUrl: "  " })).toBe(null);
    expect(checkoutHref({ mode: "live", purchaseUrl: `${checkout}?logo=0` })).toBe(`${checkout}?logo=0`);
    expect(deliveryIssuesIn(["https://example.com", "Upgrade to Pro", "scan the QR"]).length).toBe(3);
    expect(findDeliveryIssues("example.com")).toContain("domain");
    expect(findDeliveryIssues("ribbonwren.com")).toContain("domain");
    expect(findDeliveryIssues("see shop.example.co.uk/cards")).toContain("domain");
    expect(findDeliveryIssues("bit.ly/abc123")).toContain("domain");
    expect(findDeliveryIssues("pages.github.io/cards")).toContain("domain");
    expect(findDeliveryIssues("hello@example.com")).toContain("email");
    expect(findDeliveryIssues("ｈｔｔｐｓ://example.com")).toContain("url");
    expect(findDeliveryIssues("www.example.com/pro")).toEqual(expect.arrayContaining(["www", "domain", "pro"]));
    expect(findDeliveryIssues("Pro tip")).toEqual(["pro"]);
    expect(findDeliveryIssues("Unlock")).toEqual(["unlock"]);
    expect(findDeliveryIssues("Upgrade")).toEqual(["upgrade"]);
    expect(findDeliveryIssues("Join.us")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("Mr.Me")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("join.us today")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("linktr.ee/ribbonwren")).toContain("domain");
    expect(findDeliveryIssues("twitch.tv/live")).toContain("domain");
    expect(findDeliveryIssues("discord.gg/cards")).toContain("domain");
    expect(findDeliveryIssues("example.xyz")).toContain("domain");
    expect(findDeliveryIssues("example.site")).toContain("domain");
    expect(findDeliveryIssues("example.shop")).toContain("domain");
    expect(findDeliveryIssues("example.store")).toContain("domain");
    expect(findDeliveryIssues("example.link")).toContain("domain");
    expect(findDeliveryIssues("example dot com")).toContain("domain");
    expect(findDeliveryIssues("example dot com")).not.toContain("domain-word");
    expect(findDeliveryIssues("ribbonwren dot com")).toEqual(["domain"]);
    expect(findDeliveryIssues("Dot com bubble")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("Polka dot store")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("polka dot me")).toEqual(["domain-word"]);
    expect(findDeliveryIssues("example.click")).toContain("domain");
    expect(findDeliveryIssues("example.online")).toContain("domain");
    expect(findDeliveryIssues("example.page")).toContain("domain");
    expect(findDeliveryIssues("ribbonwren(.)com")).toEqual(["domain"]);
    expect(findDeliveryIssues("ribbonwren . com")).toEqual(["domain"]);
    expect(findDeliveryIssues("ribbonwren\u3002com")).toEqual(["domain"]);
    expect(findDeliveryIssues("QR code menu")).toEqual(["qr"]);
    expect(findDeliveryIssues("Shop.Com")).toContain("domain");
    expect(findDeliveryIssues("Shop.Com")).not.toContain("domain-word");
    expect(findDeliveryIssues("ribbonwren.com")).toContain("domain");
    expect(findDeliveryIssues("bit.ly/abc123")).not.toContain("domain-word");
    const parts = partitionDeliveryHits(deliveryIssuesIn([
      "Join.us",
      "Pro tip",
      "scan the QR",
      "Lemon Squeezy",
      "see Gumroad",
      "ribbonwren.com",
    ]));
    expect(parts.soft.map((hit) => hit.text)).toEqual(["Join.us", "Pro tip", "scan the QR"]);
    expect(parts.hard.map((hit) => hit.issues[0])).toEqual(["lemon", "gumroad", "domain"]);
    expect(deliveryIssuesIn(["cocoa", "paper crane", "Ribbonwren Paper Co."])).toEqual([]);
    const qrOnly = wordingWarning([{ text: "QR code menu", issues: ["qr"] }]);
    expect(qrOnly).toMatch(/QR/);
    expect(qrOnly).toMatch(/print them anyway/);
    expect(qrOnly).not.toMatch(/Pro|Upgrade|Unlock|Join\.us/);
    const proOnly = wordingWarning([{ text: "Pro tip", issues: ["pro"] }]);
    expect(proOnly).toMatch(/Pro/);
    expect(proOnly).not.toMatch(/Upgrade|QR|Join\.us/);
    const both = wordingWarning([
      { text: "Pro tip", issues: ["pro"] },
      { text: "Join.us", issues: ["domain-word"] },
    ]);
    expect(both).toMatch(/Pro/);
    expect(both).toMatch(/Join\.us/);
    expect(both).not.toMatch(/Upgrade|QR/);
    const gumroad = etsyBlockedMessage([{ text: "see Gumroad", issues: ["gumroad"] }]);
    expect(gumroad).toMatch(/Gumroad/);
    expect(gumroad).not.toMatch(/Lemon|QR|web addresses/);
    expect(scrubMeta("ribbonwren dot com")).not.toMatch(/ribbonwren/i);
    expect(scrubMeta("Polka dot store")).toMatch(/Polka dot store/);
  });

  it("rejects a saved game whose fields cannot be reprinted", () => {
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], grid: 5, cardCount: 8, pageSize: "letter" })).toBe("");
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], grid: 7 })).toMatch(/grid/);
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], cardCount: 900 })).toMatch(/card count/);
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], pageSize: "tabloid" })).toMatch(/page size/);
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], cardsPerPage: 4 })).toMatch(/cards per page/);
    expect(recipeError({ algorithm: ALGORITHM, items: ["cocoa"], theme: "winter" })).toMatch(/theme/);
    expect(recipeError({ algorithm: ALGORITHM, items: [1, 2] })).toMatch(/word list/);
    expect(recipeError(["cocoa"])).toMatch(/isn't a recipe/);
  });

  it("offers a split when one file is past the soft limit", async () => {
    const plan = await buildDeliveryFiles({
      cardCount: 4,
      singleBytes: new Uint8Array(100),
      soft: 50,
      maxFiles: 5,
      renderSlice: async ({ start, end }) => new Uint8Array(end - start),
    });
    expect(plan.warn).toBe(true);
    expect(plan.split).toBe(true);
    expect(plan.files.length).toBeGreaterThan(1);
    expect(splitRanges(4, plan.files.length).reduce((sum, range) => sum + (range.end - range.start), 0)).toBe(4);
  });
});
