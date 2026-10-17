import { ALGORITHM } from "./rng.js";

export function buildRecipe(state) {
  return {
    algorithm: ALGORITHM,
    savedAt: state.date || "",
    order: state.order || "",
    buyerFirstName: state.buyerFirstName || "",
    title: state.title || "",
    theme: state.theme || "everyday",
    grid: Number(state.grid) || 5,
    freeSpace: Boolean(state.freeSpace),
    freeSpaceText: state.freeSpaceText || "FREE",
    cardCount: Number(state.cardCount) || 1,
    pageSize: state.pageSize || "letter",
    cardsPerPage: Number(state.cardsPerPage) || 1,
    inkSaver: Boolean(state.inkSaver),
    showBingoLetters: Boolean(state.showBingoLetters),
    showAccent: state.showAccent !== false,
    seed: String(state.seed || ""),
    items: Array.isArray(state.items) ? state.items.slice() : [],
    mode: state.mode === "pictures" ? "pictures" : "words",
  };
}

const TEXT_FIELDS = ["seed", "title", "freeSpaceText", "buyerFirstName", "order"];

export function recipeError(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "That file isn't a recipe.";
  if (data.algorithm !== ALGORITHM) {
    return "This recipe uses a shuffle version this page doesn't know, so it can't be reprinted exactly.";
  }
  if (!Array.isArray(data.items) || data.items.some((item) => typeof item !== "string")) {
    return "That recipe has no word list.";
  }
  if (data.items.length > 2000) return "That recipe's list is too long.";
  if (data.items.some((item) => item.length > 200)) return "That recipe has an item that's too long.";
  if (data.grid != null && data.grid !== "" && ![3, 4, 5].includes(Number(data.grid))) {
    return "That recipe's grid isn't 3×3, 4×4, or 5×5.";
  }
  if (data.cardCount != null && data.cardCount !== "") {
    const count = Number(data.cardCount);
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      return "That recipe asks for a card count this page can't make.";
    }
  }
  if (data.pageSize != null && data.pageSize !== "" && !["letter", "a4"].includes(String(data.pageSize))) {
    return "That recipe's page size isn't Letter or A4.";
  }
  if (data.cardsPerPage != null && data.cardsPerPage !== "" && ![1, 2].includes(Number(data.cardsPerPage))) {
    return "That recipe's cards per page isn't 1 or 2.";
  }
  if (data.theme != null && data.theme !== "" && !["everyday", "christmas"].includes(String(data.theme))) {
    return "That recipe uses a theme this page doesn't have.";
  }
  if (data.mode != null && data.mode !== "" && data.mode !== "words" && data.mode !== "pictures") {
    return "That recipe's mode isn't words or pictures.";
  }
  for (const field of TEXT_FIELDS) {
    if (data[field] != null && typeof data[field] !== "string") return "That recipe has a field that isn't text.";
  }
  return "";
}
