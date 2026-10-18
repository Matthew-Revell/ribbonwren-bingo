export const PRO_UNLOCK_KEY = "rwb-unlock-pro";
export const OWNER_UNLOCK_KEY = "rwb-unlock-owner";
export const LEGACY_UNLOCK_KEY = "rwb-unlock";
export const DRAFT_KEY = "rwb-draft";

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function unlockStorageKey(tier) {
  return tier === "owner" ? OWNER_UNLOCK_KEY : PRO_UNLOCK_KEY;
}

export function saveUnlock(record, tier) {
  localStorage.setItem(unlockStorageKey(tier), JSON.stringify({ code: record?.code || "" }));
}

export function loadUnlock(tier) {
  return read(unlockStorageKey(tier));
}

export function loadLegacyUnlock() {
  return read(LEGACY_UNLOCK_KEY);
}

export function clearLegacyUnlock() {
  localStorage.removeItem(LEGACY_UNLOCK_KEY);
}

export function clearUnlock(tier) {
  if (tier) {
    localStorage.removeItem(unlockStorageKey(tier));
    return;
  }
  localStorage.removeItem(PRO_UNLOCK_KEY);
  localStorage.removeItem(OWNER_UNLOCK_KEY);
  localStorage.removeItem(LEGACY_UNLOCK_KEY);
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft() {
  return read(DRAFT_KEY);
}

export function clearAppData() {
  clearUnlock();
  localStorage.removeItem(DRAFT_KEY);
}
