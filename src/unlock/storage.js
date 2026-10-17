export const UNLOCK_KEY = "rwb-unlock";
export const DRAFT_KEY = "rwb-draft";

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUnlock(record) {
  localStorage.setItem(UNLOCK_KEY, JSON.stringify(record));
}

export function loadUnlock() {
  return read(UNLOCK_KEY);
}

export function clearUnlock() {
  localStorage.removeItem(UNLOCK_KEY);
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft() {
  return read(DRAFT_KEY);
}

export function clearAppData() {
  localStorage.removeItem(UNLOCK_KEY);
  localStorage.removeItem(DRAFT_KEY);
}
