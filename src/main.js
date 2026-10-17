import { siteConfig, purchaseHref } from "./config.js";
import { buildCards } from "./core/cards.js";
import { parseItems } from "./core/items.js";
import { getLimits } from "./core/limits.js";
import { publicPdfFilename } from "./core/filename.js";
import { buildRecipe, recipeError } from "./core/recipe.js";
import { makeSeed } from "./core/rng.js";
import { prepareImageFile, MAX_PICTURES } from "./pdf/images.js";
import { KEY_STATUS, PUBLIC_KEY } from "./unlock/public-key.js";
import { loadRevokedIds, verifyCode } from "./unlock/verify.js";
import { verifyLemonSqueezyLicense } from "./unlock/lemonsqueezy.js";
import { clearAppData, clearLegacyUnlock, clearUnlock, loadDraft, loadLegacyUnlock, loadUnlock, saveDraft, saveUnlock } from "./unlock/storage.js";
import { assessForm } from "./ui/form.js";
import { renderPreview } from "./ui/preview.js";
import { downloadBytes, downloadText } from "./ui/download.js";
import { exportGame, measureOverflow } from "./ui/export-game.js";
import { SAMPLE_WORDS } from "./ui/sample-words.js";
import {
  PRO_COMING_SOON,
  PRO_PRICE_NOTE,
  emojiDropped,
  emojiNote,
  licensedLabel,
  pictureError,
  tooLongMessage,
  unlockError,
} from "./ui/messages.js";

const $ = (id) => document.getElementById(id);
const pictures = [];
let unlock = null;
let openUrl = "";

function externalVerify() {
  return siteConfig.externalCodeType === "lemonsqueezy" ? verifyLemonSqueezyLicense : undefined;
}

function tier() {
  const value = unlock?.payload?.tier;
  return value === "pro" || value === "owner" ? value : "free";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentInput() {
  const grid = document.querySelector('input[name="grid"]:checked')?.value || "5";
  const mode = document.querySelector('input[name="mode"]:checked')?.value || "words";
  return {
    title: $("game-title").value,
    words: $("words").value,
    grid: Number(grid),
    freeSpace: $("free-space").checked,
    freeSpaceText: $("free-text").value || "FREE",
    cardCount: $("card-count").value,
    pageSize: $("page-size").value,
    cardsPerPage: Number($("per-page").value),
    theme: $("theme").value,
    inkSaver: $("ink-saver").checked,
    seed: $("seed").value,
    showBingoLetters: $("bingo-letters").checked,
    showAccent: $("good-luck").checked,
    mode,
    pictures,
    separatorMode: "lines",
  };
}

function showMessages(result) {
  for (const id of ["words-msg", "card-count-msg", "seed-msg", "pictures-msg", "free-space-msg", "unlock-msg"]) {
    const node = $(id);
    if (node && id !== "unlock-msg") node.textContent = "";
  }
  const box = $("form-messages");
  box.replaceChildren();
  for (const error of result.errors) {
    const field = $(`${error.field}-msg`) || $(`${error.field === "free-space" ? "free-space" : error.field}-msg`);
    const target = $(`${error.field}-msg`);
    if (target) target.textContent = error.text;
    const line = document.createElement("p");
    line.className = "error";
    line.textContent = error.text;
    box.append(line);
    if (field && field !== target) field.textContent = error.text;
  }
  const seen = new Set();
  for (const warning of result.warnings) {
    if (seen.has(warning.text)) continue;
    seen.add(warning.text);
    const line = document.createElement("p");
    line.className = "warning";
    line.textContent = warning.text;
    box.append(line);
  }
  $("remove-duplicates").hidden = result.parsed.duplicates.length === 0;
}

function renderProOffer() {
  const offer = $("pro-offer");
  offer.replaceChildren();
  const href = purchaseHref();
  if (href) {
    const link = document.createElement("a");
    link.className = "button";
    link.href = href;
    link.textContent = "Get Pro";
    link.id = "get-pro";
    const note = document.createElement("p");
    note.textContent = `Lifetime Pro is ${siteConfig.proPrice}.`;
    offer.append(link, note);
  } else {
    const strong = document.createElement("strong");
    strong.textContent = PRO_COMING_SOON;
    strong.id = "get-pro";
    const note = document.createElement("p");
    note.textContent = PRO_PRICE_NOTE;
    offer.append(strong, note);
  }
}

function renderUnlock() {
  const node = $("licensed");
  const limits = getLimits(tier());
  $("card-count").max = String(limits.maxCards);
  const picturesOn = limits.pictures;
  $("picture-input").disabled = !picturesOn;
  $("picture-lock").textContent = picturesOn
    ? "Pictures stay on this device. Add a caption under a photo if you want one."
    : "Pictures are part of Pro.";
  if (!unlock) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = licensedLabel(unlock.payload);
}

function previewCard(items, grid, freeSpace, freeSpaceText) {
  const n = Number(grid) || 5;
  const center = (n * n - 1) / 2;
  const cells = [];
  let cursor = 0;
  for (let index = 0; index < n * n; index++) {
    const row = Math.floor(index / n);
    const col = index % n;
    if (freeSpace && index === center) {
      cells.push({ row, col, free: true, text: freeSpaceText || "FREE", itemIndex: null });
    } else if (cursor < items.length) {
      cells.push({ row, col, free: false, text: items[cursor], itemIndex: cursor });
      cursor += 1;
    } else {
      cells.push({ row, col, free: false, text: "", itemIndex: null });
    }
  }
  return { number: 1, cells };
}

function updatePreview() {
  const input = currentInput();
  const four = input.grid === 4;
  $("free-space").disabled = four;
  $("free-space").title = four
    ? "A free space sits in the center, so it is only available for 3×3 and 5×5 cards."
    : "";
  if (four) $("free-space").checked = false;
  const mode = input.mode;
  $("words-field").hidden = mode === "pictures";
  $("picture-panel").hidden = mode !== "pictures";
  const items = mode === "pictures" ? pictures.map((picture) => picture.id) : parseItems(input.words).items;
  const freeSpace = !four && input.freeSpace;
  const built = items.length
    ? buildCards({
        items,
        seed: input.seed || "preview",
        grid: input.grid,
        freeSpace,
        freeSpaceText: input.freeSpaceText,
        count: 1,
      })
    : null;
  let card = built?.ok ? built.cards[0] : null;
  if (!card && items.length) {
    card = previewCard(items, input.grid, freeSpace, input.freeSpaceText);
  }
  const urls = new Map(pictures.map((picture) => [picture.id, picture.previewUrl]));
  if (card && mode === "pictures") {
    card = {
      ...card,
      cells: card.cells.map((cell) => {
        if (cell.free) return cell;
        const picture = pictures[cell.itemIndex];
        return picture
          ? { ...cell, imageId: picture.id, caption: picture.caption || "", text: picture.caption || "" }
          : cell;
      }),
    };
  }
  const limits = getLimits(tier());
  renderPreview($("preview"), {
    card,
    theme: input.theme,
    inkSaver: input.inkSaver,
    title: input.title,
    seed: input.seed || "preview",
    total: Number(input.cardCount) || 1,
    grid: input.grid,
    showFooter: limits.footer,
    showLetters: input.showBingoLetters,
    showAccent: input.showAccent,
    pictureUrls: urls,
  });
  const emoji = /\p{Extended_Pictographic}/u.test(input.words);
  $("emoji-note").hidden = !emoji;
  $("emoji-note").textContent = emoji ? emojiNote() : "";
  const assessment = assessForm(input, tier());
  showMessages(assessment);
}

function remember() {
  const input = currentInput();
  saveDraft({
    title: input.title,
    words: input.words,
    grid: input.grid,
    freeSpace: input.freeSpace,
    freeSpaceText: input.freeSpaceText,
    cardCount: input.cardCount,
    pageSize: input.pageSize,
    cardsPerPage: input.cardsPerPage,
    theme: input.theme,
    inkSaver: input.inkSaver,
    seed: input.seed,
    showBingoLetters: input.showBingoLetters,
    showAccent: input.showAccent,
    mode: input.mode,
  });
}

function applyDraft(draft) {
  if (!draft) return;
  $("game-title").value = draft.title || "";
  $("words").value = draft.words || "";
  const grid = String(draft.grid || 5);
  const radio = document.querySelector(`input[name="grid"][value="${grid}"]`);
  if (radio) radio.checked = true;
  $("free-space").checked = draft.freeSpace !== false;
  $("free-text").value = draft.freeSpaceText || "FREE";
  $("card-count").value = draft.cardCount || 8;
  $("page-size").value = draft.pageSize || "letter";
  $("per-page").value = String(draft.cardsPerPage || 1);
  $("theme").value = draft.theme || "everyday";
  $("ink-saver").checked = Boolean(draft.inkSaver);
  $("seed").value = draft.seed || "";
  $("bingo-letters").checked = draft.showBingoLetters !== false;
  $("good-luck").checked = draft.showAccent !== false;
  const mode = document.querySelector(`input[name="mode"][value="${draft.mode || "words"}"]`);
  if (mode) mode.checked = true;
}

function renderPictureList() {
  const list = $("picture-list");
  list.replaceChildren();
  for (const picture of pictures) {
    const item = document.createElement("li");
    const img = document.createElement("img");
    img.src = picture.previewUrl;
    img.alt = "";
    const caption = document.createElement("input");
    caption.type = "text";
    caption.value = picture.caption || "";
    caption.setAttribute("aria-label", `Caption for ${picture.name}`);
    caption.addEventListener("input", () => {
      picture.caption = caption.value;
      updatePreview();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(picture.previewUrl);
      pictures.splice(pictures.indexOf(picture), 1);
      renderPictureList();
      updatePreview();
    });
    item.append(img, caption, remove);
    list.append(item);
  }
}

async function onPictures(event) {
  const files = [...event.target.files];
  event.target.value = "";
  const messages = [];
  for (const file of files) {
    if (pictures.length >= MAX_PICTURES) {
      messages.push(pictureError("limit"));
      break;
    }
    const prepared = await prepareImageFile(file);
    if (prepared.error) messages.push(pictureError(prepared.error));
    else pictures.push(prepared);
  }
  renderPictureList();
  updatePreview();
  if (messages[0]) $("pictures-msg").textContent = messages[0];
}

async function acceptCode(code) {
  const revokedIds = await loadRevokedIds(`${import.meta.env.BASE_URL}revoked.json`);
  const result = await verifyCode(code, {
    publicKey: PUBLIC_KEY,
    revokedIds,
    externalVerify: externalVerify(),
  });
  $("unlock-msg").textContent = result.ok ? "" : unlockError(result.reason);
  if (!result.ok) return false;
  unlock = { code, payload: result.payload };
  saveUnlock({ code }, result.payload.tier === "owner" ? "owner" : "pro");
  renderUnlock();
  updatePreview();
  return true;
}

async function bootUnlock() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromHash = params.get("unlock");
  if (fromHash) {
    const ok = await acceptCode(fromHash.trim());
    if (ok) history.replaceState(null, "", location.pathname + location.search);
  }
  if (!unlock) {
    const legacy = loadLegacyUnlock();
    const stored = loadUnlock("pro") || legacy || loadUnlock("owner");
    if (stored?.code) {
      const ok = await acceptCode(stored.code);
      if (ok && stored === legacy) clearLegacyUnlock();
    }
  }
}

function resetForm() {
  for (const picture of pictures) URL.revokeObjectURL(picture.previewUrl);
  pictures.splice(0, pictures.length);
  $("game-form").reset();
  $("card-count").value = "8";
  $("free-text").value = "FREE";
  $("seed").value = makeSeed();
  document.querySelector('input[name="grid"][value="5"]').checked = true;
  document.querySelector('input[name="mode"][value="words"]').checked = true;
  $("bingo-letters").checked = true;
  $("good-luck").checked = true;
  $("free-space").checked = true;
  renderPictureList();
}

async function onDownload(event) {
  event.preventDefault();
  const input = currentInput();
  const result = assessForm(input, tier());
  showMessages(result);
  if (!result.ok) return;
  const texts = input.mode === "pictures"
    ? pictures.map((picture) => picture.caption || picture.name || "Picture")
    : result.parsed.items;
  const fit = await measureOverflow({
    grid: result.grid,
    cardsPerPage: input.cardsPerPage,
    freeSpace: result.freeSpace,
    title: input.title,
    showBingoLetters: input.showBingoLetters,
    showAccent: input.showAccent,
    inkSaver: input.inkSaver,
    texts,
  });
  if (fit.cells.some((cell) => cell.overflow)) {
    const sample = texts[fit.cells.findIndex((cell) => cell.overflow)] || texts[0];
    $("words-msg").textContent = tooLongMessage(sample, result.grid, input.cardsPerPage);
    return;
  }
  const count = result.count;
  $("progress-wrap").hidden = count <= 50;
  $("download").disabled = true;
  $("download-status").textContent = "Making the PDF…";
  try {
    const exported = await exportGame({
      title: input.title,
      items: input.mode === "pictures" ? pictures.map((picture) => picture.id) : result.parsed.items,
      pictures: input.mode === "pictures" ? pictures : [],
      callItems: input.mode === "pictures"
        ? pictures.map((picture) => ({ label: picture.caption || picture.name || "Picture", imageId: picture.id }))
        : result.parsed.items,
      seed: input.seed.trim(),
      grid: result.grid,
      freeSpace: result.freeSpace,
      freeSpaceText: input.freeSpaceText,
      count,
      themeId: input.theme,
      inkSaver: input.inkSaver,
      pageSize: input.pageSize,
      cardsPerPage: input.cardsPerPage,
      tier: tier(),
      date: today(),
      showBingoLetters: input.showBingoLetters,
      showAccent: input.showAccent,
      audience: "public",
      licensedTo: unlock?.payload?.n || "",
      shopUrl: siteConfig.shopUrl,
      onProgress: ({ done, total }) => {
        $("progress").max = total;
        $("progress").value = done;
        $("progress-label").textContent = `Card ${done} of ${total}`;
      },
    });
    if (!exported.ok) {
      $("download-status").textContent = "The PDF could not be made from this list.";
      return;
    }
    if (exported.glyphWarnings?.length) {
      const line = document.createElement("p");
      line.className = "warning";
      line.textContent = emojiDropped(exported.glyphWarnings);
      $("form-messages").append(line);
    }
    const filename = publicPdfFilename({
      title: input.title,
      count,
      pageSize: input.pageSize,
    });
    if (openUrl) URL.revokeObjectURL(openUrl);
    openUrl = downloadBytes(exported.bytes, filename);
    $("open-pdf-link").href = openUrl;
    $("open-pdf").hidden = false;
    $("download-status").textContent = `Saved ${filename}.`;
  } catch (error) {
    console.error(error);
    $("download-status").textContent = "The PDF could not be made from this list.";
  } finally {
    $("download").disabled = false;
    $("progress-wrap").hidden = true;
  }
}

function onSaveGame() {
  const limits = getLimits(tier());
  if (!limits.saveGame) {
    $("download-status").textContent = "Saving a game file is part of Pro.";
    return;
  }
  const input = currentInput();
  const parsed = parseItems(input.words);
  const recipe = buildRecipe({
    ...input,
    items: input.mode === "pictures" ? pictures.map((picture) => picture.caption || picture.name) : parsed.items,
    date: today(),
    cardCount: Number(input.cardCount) || 1,
  });
  downloadText(JSON.stringify(recipe, null, 2), "ribbonwren-bingo-game.json", "application/json");
}

async function onLoadGame(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!getLimits(tier()).saveGame) {
    $("download-status").textContent = "Loading a saved game is part of Pro.";
    return;
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    $("download-status").textContent = "That file isn't a recipe.";
    return;
  }
  const problem = recipeError(data);
  if (problem) {
    $("download-status").textContent = problem;
    return;
  }
  applyDraft({ ...data, words: (data.items || []).join("\n"), cardCount: data.cardCount });
  $("download-status").textContent = "Game loaded.";
  updatePreview();
  remember();
}

function bind() {
  $("game-form").addEventListener("submit", onDownload);
  $("game-form").addEventListener("input", () => {
    updatePreview();
    remember();
  });
  $("new-seed").addEventListener("click", () => {
    $("seed").value = makeSeed();
    updatePreview();
    remember();
  });
  $("sample-list").addEventListener("click", () => {
    $("words").value = SAMPLE_WORDS.join("\n");
    document.querySelector('input[name="mode"][value="words"]').checked = true;
    updatePreview();
    remember();
  });
  $("remove-duplicates").addEventListener("click", () => {
    const parsed = parseItems($("words").value);
    $("words").value = parsed.items.join("\n");
    updatePreview();
    remember();
  });
  $("picture-input").addEventListener("change", onPictures);
  $("unlock-button").addEventListener("click", () => acceptCode($("unlock-code").value.trim()));
  $("remove-unlock").addEventListener("click", () => {
    clearUnlock(unlock?.payload?.tier === "owner" ? "owner" : "pro");
    clearLegacyUnlock();
    unlock = null;
    renderUnlock();
    updatePreview();
  });
  $("clear-data").addEventListener("click", () => {
    clearAppData();
    unlock = null;
    resetForm();
    renderUnlock();
    updatePreview();
    $("download-status").textContent = "Saved words and the unlock were removed from this browser.";
  });
  $("save-game").addEventListener("click", onSaveGame);
  $("load-game").addEventListener("change", onLoadGame);
}

async function main() {
  if (KEY_STATUS !== "production") {
    const banner = $("test-key-banner");
    banner.hidden = false;
    banner.textContent = "Test key only. Codes unlocked here are not for real sales. Replace the public key before launch.";
  }
  renderProOffer();
  applyDraft(loadDraft());
  if (!$("seed").value) $("seed").value = makeSeed();
  bind();
  window.addEventListener("hashchange", () => {
    bootUnlock();
  });
  await bootUnlock();
  renderUnlock();
  updatePreview();
}

main();
