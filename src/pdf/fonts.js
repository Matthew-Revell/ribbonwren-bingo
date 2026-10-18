import fontkit from "@pdf-lib/fontkit";

export const FONT_FILES = {
  display: "DMSerifDisplay-Regular.ttf",
  regular: "Nunito-Regular.ttf",
  bold: "Nunito-Bold.ttf",
  extraBold: "Nunito-ExtraBold.ttf",
  caveat: "Caveat-Bold.ttf",
};

export async function loadFontBytes(fetchImpl = fetch) {
  const base = import.meta.env?.BASE_URL ?? "/";
  const out = {};
  for (const [key, file] of Object.entries(FONT_FILES)) {
    const response = await fetchImpl(`${base}fonts/${file}`);
    if (!response.ok) throw new Error(`Could not load the font ${file}.`);
    out[key] = new Uint8Array(await response.arrayBuffer());
  }
  return out;
}

export async function loadLogoBytes(fetchImpl = fetch) {
  const base = import.meta.env?.BASE_URL ?? "/";
  const names = [
    "ribbonwren-mark.png",
    "ribbonwren-mark-holiday.png",
    "star-gold.png",
    "star-cranberry.png",
  ];
  const out = {};
  for (const name of names) {
    const response = await fetchImpl(`${base}img/${name}`);
    if (!response.ok) throw new Error(`Could not load ${name}.`);
    out[name] = new Uint8Array(await response.arrayBuffer());
  }
  return out;
}

export function openFontkit(bytes) {
  return fontkit.create(bytes);
}

// PDF subset fonts use a six-letter tag and a plus sign. pdf-lib subsets the
// glyphs but names the font with a random suffix, which readers report as a
// full font. These tags make the subset visible to pdffonts.
const SUBSET_NAMES = {
  display: "RWBDIS+DMSerifDisplay-Regular",
  regular: "RWBREG+Nunito-Regular",
  bold: "RWBBOL+Nunito-Bold",
  extraBold: "RWBEXB+Nunito-ExtraBold",
  caveat: "RWBCAV+Caveat-Bold",
};

export async function embedFonts(pdfDoc, bytes) {
  pdfDoc.registerFontkit(fontkit);
  const embedded = {};
  for (const key of Object.keys(SUBSET_NAMES)) {
    embedded[key] = await pdfDoc.embedFont(bytes[key], {
      subset: true,
      customName: SUBSET_NAMES[key],
    });
  }
  return embedded;
}
