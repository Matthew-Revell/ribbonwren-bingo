import { resolveTheme } from "../themes/index.js";
import { FREE_FOOTER } from "./messages.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderPreview(root, model) {
  root.replaceChildren();
  const theme = resolveTheme(model.theme, model.inkSaver);
  const sheet = el("div", `sheet theme-${theme.id}${theme.inkSaver ? " ink-saver" : ""}`);
  sheet.style.setProperty("--sheet", theme.page);
  sheet.style.setProperty("--bar", theme.titleBar || "transparent");
  sheet.style.setProperty("--bar-text", theme.titleText);
  sheet.style.setProperty("--line", theme.cellLine);
  sheet.style.setProperty("--cell", theme.cellFill || "#ffffff");
  sheet.style.setProperty("--free", theme.freeFill || "transparent");
  sheet.style.setProperty("--free-text", theme.freeText);
  sheet.style.setProperty("--ink", theme.text);
  sheet.style.setProperty("--accent", theme.accent || "transparent");

  if (model.title) sheet.append(el("div", "sheet-title", model.title));
  if (model.showAccent && theme.accent) sheet.append(el("div", "sheet-accent", "Good luck!"));
  if (model.showLetters && model.grid === 5) {
    const letters = el("div", "sheet-letters");
    for (const letter of ["B", "I", "N", "G", "O"]) letters.append(el("span", "", letter));
    sheet.append(letters);
  }

  const grid = el("div", "sheet-grid");
  grid.style.gridTemplateColumns = `repeat(${model.grid}, 1fr)`;
  const card = model.card;
  if (!card) {
    const empty = el("p", "sheet-empty", "Your first card will show up here.");
    sheet.append(empty);
  } else {
    for (const cell of card.cells) {
      const node = el("div", cell.free ? "cell free" : "cell");
      if (cell.imageId && model.pictureUrls) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = model.pictureUrls.get(cell.imageId) || "";
        node.append(img);
        if (cell.caption) node.append(el("span", "caption", cell.caption));
      } else {
        node.append(el("span", "cell-text", cell.text));
      }
      grid.append(node);
    }
    sheet.append(grid);
  }

  const id = card
    ? `Game ${model.seed} · Card 01 of ${String(model.total).padStart(2, "0")}`
    : "Card id";
  sheet.append(el("p", "sheet-id", id));
  if (model.showFooter) sheet.append(el("p", "sheet-footer", FREE_FOOTER));
  root.append(sheet);
}
