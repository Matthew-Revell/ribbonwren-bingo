import { siteConfig } from "./config.js";
import { buildRecipe, recipeError } from "./core/recipe.js";
import { parseItems } from "./core/items.js";
import { buildCards } from "./core/cards.js";
import {
  licenseFilename,
  ownerCardFilename,
  ownerRecipeFilename,
} from "./core/filename.js";
import { deliveryIssuesIn } from "./pdf/etsy-safe.js";
import { prepareImageFile, MAX_PICTURES } from "./pdf/images.js";
import { buildDeliveryFiles, deliveryWarning } from "./pdf/split.js";
import { renderLicensePdf } from "./pdf/license.js";
import { KEY_STATUS, PUBLIC_KEY } from "./unlock/public-key.js";
import { importPrivateKey, signPayload, buildPayload } from "./unlock/sign.js";
import { loadRevokedIds, verifyCode } from "./unlock/verify.js";
import { ledgerCsv, parseLedger } from "./unlock/ledger.js";
import { loadUnlock, saveUnlock } from "./unlock/storage.js";
import { loadAssets, exportGame } from "./ui/export-game.js";
import { assessForm } from "./ui/form.js";
import { renderPreview } from "./ui/preview.js";
import { downloadBytes, downloadText } from "./ui/download.js";
import { pictureError, unlockError } from "./ui/messages.js";
import {
  LEDGER_NOTE,
  LICENSE_NOTE,
  KEY_NOTE,
  REVIEW_NOTE,
  TURNAROUND,
  etsyBlockedMessage,
  splitTooBigMessage,
} from "./ui/owner-messages.js";

const $ = (id) => document.getElementById(id);
const pictures = [];
let unlock = null;
let seedDirty = false;
let privateKey = null;
let ledger = [];
let pendingBytes = null;
let pendingName = "";
let licenseBytes = null;
let licenseName = "";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentInput() {
  const grid = document.querySelector('input[name="grid"]:checked')?.value || "5";
  const mode = pictures.length ? "pictures" : "words";
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
    separatorMode: "auto",
    requireOrder: true,
    order: $("order-number").value,
  };
}

function showMessages(result) {
  for (const id of ["words-msg", "card-count-msg", "seed-msg", "pictures-msg", "order-msg"]) {
    const node = $(id);
    if (node) node.textContent = "";
  }
  const box = $("form-messages");
  box.replaceChildren();
  for (const error of result.errors) {
    const target = $(`${error.field}-msg`);
    if (target) target.textContent = error.text;
    const line = document.createElement("p");
    line.className = "error";
    line.textContent = error.text;
    box.append(line);
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

function updatePreview() {
  const input = currentInput();
  const four = input.grid === 4;
  $("free-space").disabled = four;
  if (four) $("free-space").checked = false;
  const items = input.mode === "pictures" ? pictures.map((picture) => picture.id) : parseItems(input.words, { mode: "auto" }).items;
  const built = items.length
    ? buildCards({
        items,
        seed: input.seed || "preview",
        grid: input.grid,
        freeSpace: !four && input.freeSpace,
        freeSpaceText: input.freeSpaceText,
        count: 1,
      })
    : null;
  let card = built?.ok ? built.cards[0] : null;
  if (card && input.mode === "pictures") {
    card = {
      ...card,
      cells: card.cells.map((cell) => {
        if (cell.free) return cell;
        const picture = pictures[cell.itemIndex];
        return picture ? { ...cell, imageId: picture.id, caption: picture.caption || "", text: picture.caption || "" } : cell;
      }),
    };
  }
  renderPreview($("preview"), {
    card,
    theme: input.theme,
    inkSaver: input.inkSaver,
    title: input.title,
    seed: input.seed || input.order || "preview",
    total: Number(input.cardCount) || 1,
    grid: input.grid,
    showFooter: false,
    showLetters: input.showBingoLetters,
    showAccent: input.showAccent,
    pictureUrls: new Map(pictures.map((picture) => [picture.id, picture.previewUrl])),
  });
  showMessages(assessForm(input, "owner"));
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

function gameOptions(input, result, extra = {}) {
  const wordItems = result.parsed.items;
  return {
    title: input.title,
    items: input.mode === "pictures" ? pictures.map((picture) => picture.id) : wordItems,
    pictures: input.mode === "pictures" ? pictures : [],
    callItems: input.mode === "pictures"
      ? pictures.map((picture) => ({ label: picture.caption || picture.name || "Picture", imageId: picture.id }))
      : wordItems,
    seed: input.seed.trim(),
    grid: result.grid,
    freeSpace: result.freeSpace,
    freeSpaceText: input.freeSpaceText,
    count: result.count,
    themeId: input.theme,
    inkSaver: input.inkSaver,
    pageSize: input.pageSize,
    cardsPerPage: input.cardsPerPage,
    tier: "owner",
    date: today(),
    showBingoLetters: input.showBingoLetters,
    showAccent: input.showAccent,
    audience: "etsy",
    shopUrl: "",
    licensedTo: "",
    ...extra,
  };
}

function stringsForDelivery(input, result) {
  const labels = input.mode === "pictures"
    ? pictures.map((picture) => picture.caption || picture.name || "Picture")
    : result.parsed.items;
  return [input.title, input.freeSpaceText, input.buyerFirstName || $("buyer-name").value, ...labels];
}

async function makeFile(input, result, extra) {
  return exportGame(gameOptions(input, result, extra));
}

function showSizeOffer(bytes, filename) {
  pendingBytes = bytes;
  pendingName = filename;
  const warning = deliveryWarning(bytes.length);
  const box = $("size-warning");
  if (!warning) {
    box.hidden = true;
    $("download-anyway").hidden = true;
    $("split-files").hidden = true;
    return false;
  }
  box.hidden = false;
  box.textContent = warning;
  $("download-anyway").hidden = false;
  $("split-files").hidden = false;
  return true;
}

async function onMakePdf(event) {
  event.preventDefault();
  const input = currentInput();
  const result = assessForm(input, "owner");
  showMessages(result);
  if (!result.ok) return;
  const hits = deliveryIssuesIn(stringsForDelivery(input, result));
  if (hits.length) {
    $("order-status").textContent = etsyBlockedMessage(hits);
    return;
  }
  $("order-status").textContent = "Making the PDF…";
  const exported = await makeFile(input, result);
  if (!exported.ok) {
    $("order-status").textContent = exported.error === "etsy-text"
      ? etsyBlockedMessage(exported.hits || [])
      : "The PDF could not be made from this list.";
    return;
  }
  const filename = ownerCardFilename({
    order: input.order,
    count: result.count,
    pageSize: input.pageSize,
  });
  if (showSizeOffer(exported.bytes, filename)) {
    $("order-status").textContent = "This file is large. Split it, or download it anyway.";
    return;
  }
  downloadBytes(exported.bytes, filename);
  $("order-status").textContent = `Saved ${filename}.`;
}

async function onSplit() {
  if (!pendingBytes) return;
  const input = currentInput();
  const result = assessForm(input, "owner");
  if (!result.ok) return;
  $("order-status").textContent = "Splitting the file…";
  const plan = await buildDeliveryFiles({
    cardCount: result.count,
    singleBytes: pendingBytes,
    renderSlice: async ({ start, end, part, parts }) => {
      const exported = await makeFile(input, result, {
        cardStart: start,
        cardEnd: end,
        cardTotal: result.count,
        includeCallSheet: part === 1,
        partNote: part === 1 ? "" : `Part ${part} of ${parts}. The call sheet is in part 1 of this set.`,
      });
      if (!exported.ok) throw new Error("split-failed");
      return exported.bytes;
    },
  });
  if (!plan.split || !plan.files) {
    $("order-status").textContent = splitTooBigMessage();
    return;
  }
  plan.files.forEach((file) => {
    const name = ownerCardFilename({
      order: input.order,
      count: result.count,
      pageSize: input.pageSize,
      part: file.part,
    });
    downloadBytes(file.bytes, name);
  });
  $("order-status").textContent = `Saved ${plan.files.length} files.`;
}

function recipeState(input, result) {
  return buildRecipe({
    ...input,
    items: input.mode === "pictures"
      ? pictures.map((picture) => picture.caption || picture.name || "Picture")
      : result.parsed.items,
    date: today(),
    cardCount: result.count,
    order: input.order,
    buyerFirstName: $("buyer-name").value.trim(),
  });
}

function onSaveRecipe() {
  const input = currentInput();
  const result = assessForm({ ...input, requireOrder: false }, "owner");
  const recipe = recipeState(input, result.ok ? result : { ...result, parsed: parseItems(input.words, { mode: "auto" }), count: Number(input.cardCount) || 1 });
  const name = ownerRecipeFilename(input.order || "order");
  downloadText(JSON.stringify(recipe, null, 2), name, "application/json");
}

async function onLoadRecipe(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    $("order-status").textContent = "That file isn't a recipe.";
    return;
  }
  const problem = recipeError(data);
  if (problem) {
    $("order-status").textContent = problem;
    return;
  }
  $("order-number").value = data.order || "";
  $("buyer-name").value = data.buyerFirstName || "";
  $("game-title").value = data.title || "";
  $("words").value = (data.items || []).join("\n");
  const radio = document.querySelector(`input[name="grid"][value="${data.grid}"]`);
  if (radio) radio.checked = true;
  $("free-space").checked = Boolean(data.freeSpace);
  $("free-text").value = data.freeSpaceText || "FREE";
  $("card-count").value = data.cardCount || 1;
  $("page-size").value = data.pageSize || "letter";
  $("per-page").value = String(data.cardsPerPage || 1);
  $("theme").value = data.theme || "everyday";
  $("ink-saver").checked = Boolean(data.inkSaver);
  $("bingo-letters").checked = data.showBingoLetters !== false;
  $("good-luck").checked = data.showAccent !== false;
  $("seed").value = data.seed || data.order || "";
  seedDirty = true;
  updatePreview();
  $("order-status").textContent = "Recipe loaded.";
}

async function onKey(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    privateKey = await importPrivateKey(parsed);
    $("key-status").textContent = "Key loaded for this tab only.";
    $("code-msg").textContent = "";
  } catch {
    privateKey = null;
    $("key-status").textContent = "That file is not a private key.";
  }
}

async function onMakeCode() {
  if (!privateKey) {
    $("code-msg").textContent = "Load the private key file first. It stays in this tab only.";
    return;
  }
  const name = $("code-name").value.trim();
  const order = $("code-order").value.trim();
  if (!order) {
    $("code-msg").textContent = "Enter an order reference.";
    return;
  }
  const payload = buildPayload({ tier: "pro", name, order, date: today() });
  const code = await signPayload(privateKey, payload);
  const link = `${siteConfig.siteUrl}#unlock=${code}`;
  $("code-link").textContent = link;
  $("code-plain").textContent = code;
  ledger.push({ date: payload.t, id: payload.id, order: payload.o, name: payload.n });
  const [fontBytes, logoBytes] = await loadAssets();
  const license = await renderLicensePdf({
    name,
    order,
    codeId: payload.id,
    code,
    fontBytes,
    logoBytes: logoBytes["ribbonwren-mark.png"],
  });
  licenseBytes = license.bytes;
  licenseName = licenseFilename(order);
  $("download-license").hidden = false;
  $("code-msg").textContent = `Code ${payload.id} is ready. Download the license PDF for the website sale.`;
}

async function boot() {
  if (KEY_STATUS !== "production") {
    $("test-key-banner").hidden = false;
    $("test-key-banner").textContent = "Test key only. Do not sell codes from this copy.";
  }
  $("turnaround").textContent = TURNAROUND;
  $("review-note").textContent = REVIEW_NOTE;
  $("key-note").textContent = KEY_NOTE;
  $("license-note").textContent = LICENSE_NOTE;
  $("ledger-note").textContent = LEDGER_NOTE;
  const stored = loadUnlock();
  if (stored?.code) {
    const revokedIds = await loadRevokedIds(`${import.meta.env.BASE_URL}revoked.json`);
    const result = await verifyCode(stored.code, { publicKey: PUBLIC_KEY, revokedIds });
    if (result.ok && result.payload.tier === "owner") {
      unlock = result;
      $("owner-gate").hidden = true;
      $("owner-app").hidden = false;
    }
  }
  $("owner-unlock").addEventListener("click", async () => {
    const revokedIds = await loadRevokedIds(`${import.meta.env.BASE_URL}revoked.json`);
    const result = await verifyCode($("owner-code").value.trim(), { publicKey: PUBLIC_KEY, revokedIds });
    if (!result.ok || result.payload.tier !== "owner") {
      const reason = result.ok ? null : (result.reason === "not-configured" ? "garbage" : result.reason);
      $("owner-msg").textContent = result.ok ? "That code is not an owner code." : unlockError(reason);
      return;
    }
    unlock = result;
    saveUnlock({ code: $("owner-code").value.trim() });
    $("owner-gate").hidden = true;
    $("owner-app").hidden = false;
    if (!$("seed").value) $("seed").value = $("order-number").value.trim();
    updatePreview();
  });
  $("order-number").addEventListener("input", () => {
    if (!seedDirty) $("seed").value = $("order-number").value.trim();
    updatePreview();
  });
  $("seed").addEventListener("input", () => {
    seedDirty = true;
  });
  $("order-form").addEventListener("input", updatePreview);
  $("order-form").addEventListener("submit", onMakePdf);
  $("download-anyway").addEventListener("click", () => {
    if (!pendingBytes) return;
    downloadBytes(pendingBytes, pendingName);
    $("order-status").textContent = `Saved ${pendingName}.`;
  });
  $("split-files").addEventListener("click", onSplit);
  $("save-recipe").addEventListener("click", onSaveRecipe);
  $("load-recipe").addEventListener("change", onLoadRecipe);
  $("remove-duplicates").addEventListener("click", () => {
    $("words").value = parseItems($("words").value, { mode: "auto" }).items.join("\n");
    updatePreview();
  });
  $("picture-input").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    const problems = [];
    for (const file of files) {
      if (pictures.length >= MAX_PICTURES) {
        problems.push(pictureError("limit"));
        break;
      }
      const prepared = await prepareImageFile(file);
      if (prepared.error) problems.push(pictureError(prepared.error));
      else pictures.push(prepared);
    }
    $("pictures-msg").textContent = problems[0] || "";
    renderPictureList();
    updatePreview();
  });
  $("key-file").addEventListener("change", onKey);
  $("remove-key").addEventListener("click", () => {
    privateKey = null;
    $("key-status").textContent = "Key removed from this tab.";
  });
  $("make-code").addEventListener("click", onMakeCode);
  $("download-license").addEventListener("click", () => {
    if (licenseBytes) downloadBytes(licenseBytes, licenseName);
  });
  $("download-ledger").addEventListener("click", () => {
    downloadText(ledgerCsv(ledger), "RW-Bingo_code-ledger.csv", "text/csv");
  });
  $("ledger-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const older = parseLedger(await file.text());
    ledger = older.concat(ledger);
    $("order-status").textContent = `Ledger has ${ledger.length} rows.`;
  });
  window.addEventListener("pagehide", () => {
    privateKey = null;
  });
}

boot();
