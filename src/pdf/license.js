import { PDFDocument, rgb } from "pdf-lib";
import { siteConfig } from "../config.js";
import { embedFonts } from "./fonts.js";
import { fitText } from "./fit-text.js";

export function unlockLink(code, siteUrl = siteConfig.siteUrl) {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  return `${base}#unlock=${code}`;
}

export async function qrPng(text) {
  const mod = await import("qrcode");
  const api = mod.default || mod;
  if (typeof api.toBuffer === "function") {
    try {
      const buf = await api.toBuffer(text, {
        type: "png",
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    } catch {
      /* Browser builds may not have toBuffer. */
    }
  }
  const dataUrl = await api.toDataURL(text, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function paint(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * One-page website license. This file is allowed to contain the unlock link,
 * the plain code, and a scan code. It is not an Etsy delivery file, and the
 * page does not describe itself as one.
 */
export async function renderLicensePdf({
  name,
  order,
  codeId,
  code,
  fontBytes,
  logoBytes = null,
  qrBytes = null,
  siteUrl,
}) {
  const link = unlockLink(code, siteUrl);
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf, fontBytes);
  const page = pdf.addPage([612, 792]);
  const ink = paint("#2B2A33");
  const evergreen = paint("#2F5D50");
  const cranberry = paint("#B8434A");
  const cream = paint("#FAF5EC");
  const oat = paint("#E8D9C0");
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: evergreen });

  let cursor = 710;
  if (logoBytes) {
    const logo = await pdf.embedPng(logoBytes);
    const side = 42;
    page.drawImage(logo, { x: 48, y: 746, width: side, height: side });
  }
  page.drawText("Ribbonwren Bingo Pro", {
    x: logoBytes ? 100 : 48,
    y: 762,
    size: 22,
    font: fonts.display,
    color: cream,
  });

  const licensed = name ? `Licensed to ${name}` : "Lifetime license";
  page.drawText(licensed, { x: 48, y: cursor, size: 20, font: fonts.display, color: evergreen });
  cursor -= 28;
  page.drawText(`Order ${order || "—"}`, { x: 48, y: cursor, size: 12, font: fonts.bold, color: ink });
  cursor -= 18;
  page.drawText(`Code id ${codeId}`, { x: 48, y: cursor, size: 12, font: fonts.bold, color: ink });
  cursor -= 32;

  page.drawText("How to unlock", { x: 48, y: cursor, size: 14, font: fonts.extraBold, color: cranberry });
  cursor -= 22;
  const steps = [
    "Open the link on this page. The site should unlock on its own.",
    "If it does not, open Ribbonwren Bingo, choose Enter unlock code, and paste the code below.",
    "You should see Pro unlocked, with the licensed name. It stays in that browser until you remove it.",
  ];
  for (let i = 0; i < steps.length; i++) {
    const fit = fitText(`${i + 1}. ${steps[i]}`, {
      maxWidth: 500,
      maxHeight: 40,
      maxSize: 11,
      minSize: 9,
      measure: (text, size) => fonts.regular.widthOfTextAtSize(text, size),
    });
    for (const line of fit.lines) {
      page.drawText(line, { x: 48, y: cursor, size: fit.size, font: fonts.regular, color: ink });
      cursor -= fit.size * 1.25;
    }
    cursor -= 6;
  }

  cursor -= 8;
  page.drawText("Unlock link", { x: 48, y: cursor, size: 12, font: fonts.extraBold, color: evergreen });
  cursor -= 18;
  const linkFit = fitText(link, {
    maxWidth: 340,
    maxHeight: 80,
    maxSize: 9,
    minSize: 7,
    measure: (text, size) => fonts.regular.widthOfTextAtSize(text, size),
  });
  for (const line of linkFit.lines) {
    page.drawText(line, { x: 48, y: cursor, size: linkFit.size, font: fonts.regular, color: ink });
    cursor -= linkFit.size * 1.3;
  }

  const png = qrBytes || (await qrPng(link));
  const qr = await pdf.embedPng(png);
  page.drawImage(qr, { x: 430, y: 470, width: 130, height: 130 });

  cursor = Math.min(cursor, 450) - 10;
  page.drawText("Or scan this code.", { x: 430, y: 452, size: 10, font: fonts.regular, color: ink });

  page.drawText("Plain code", { x: 48, y: cursor, size: 12, font: fonts.extraBold, color: evergreen });
  cursor -= 16;
  const codeFit = fitText(code, {
    maxWidth: 500,
    maxHeight: 70,
    maxSize: 8,
    minSize: 6,
    measure: (text, size) => fonts.regular.widthOfTextAtSize(text, size),
  });
  page.drawRectangle({
    x: 42,
    y: cursor - codeFit.lines.length * codeFit.size * 1.3 - 8,
    width: 528,
    height: codeFit.lines.length * codeFit.size * 1.3 + 18,
    color: rgb(1, 1, 1),
    borderColor: oat,
    borderWidth: 1,
  });
  for (const line of codeFit.lines) {
    page.drawText(line, { x: 52, y: cursor, size: codeFit.size, font: fonts.regular, color: ink });
    cursor -= codeFit.size * 1.3;
  }

  page.drawText("Website purchase only. Do not upload this file to a marketplace.", {
    x: 48,
    y: 48,
    size: 10,
    font: fonts.bold,
    color: cranberry,
  });
  page.drawText("Ribbonwren Paper Co.", {
    x: 48,
    y: 32,
    size: 9,
    font: fonts.regular,
    color: ink,
  });

  pdf.setTitle(`Ribbonwren Bingo license ${codeId}`);
  pdf.setAuthor("Ribbonwren Paper Co.");
  pdf.setCreator("Ribbonwren Paper Co.");
  pdf.setProducer("Ribbonwren Bingo");
  pdf.setSubject(name ? `Licensed to ${name}` : "Lifetime license");
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes: new Uint8Array(bytes), link };
}
