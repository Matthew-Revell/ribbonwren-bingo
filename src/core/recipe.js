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

export function recipeError(data) {
  if (!data || typeof data !== "object") return "That file isn't a recipe.";
  if (data.algorithm !== ALGORITHM) {
    return "This recipe uses a shuffle version this page doesn't know, so it can't be reprinted exactly.";
  }
  if (!Array.isArray(data.items)) return "That recipe has no word list.";
  return "";
}
