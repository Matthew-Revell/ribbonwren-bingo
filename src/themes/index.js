import { christmas } from "./christmas.js";
import { everyday } from "./everyday.js";

export const themes = [everyday, christmas];

export function getTheme(id) {
  return themes.find((theme) => theme.id === id) || everyday;
}

export function listThemes() {
  return themes.map((theme) => ({ id: theme.id, name: theme.name, free: theme.free }));
}

/** Ink-saver drops filled backgrounds. The accent line is off. Footer art is off. */
export function resolveTheme(id, inkSaver) {
  const base = getTheme(id);
  if (!inkSaver) return { ...base, inkSaver: false };
  const titleInk = base.id === "christmas" ? "#1F4038" : "#2F5D50";
  return {
    ...base,
    inkSaver: true,
    page: "#FFFFFF",
    titleBar: null,
    titleText: titleInk,
    rule: null,
    letterBg: null,
    letterText: "#2B2A33",
    cellFill: "#FFFFFF",
    cellLine: "#2B2A33",
    cellLineWidth: 1,
    cornerDots: null,
    text: "#2B2A33",
    freeFill: null,
    freeText: "#2B2A33",
    accent: null,
    stars: false,
    mark: null,
  };
}
