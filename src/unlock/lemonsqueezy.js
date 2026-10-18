/**
 * Lemon Squeezy public License API. No API key.
 * Activate only when the caller sets allowActivate (the Unlock button).
 * A stored instance is validated and is never activated again on its own.
 * A failed connection can keep Pro unlocked for LEMON_OFFLINE_GRACE_MS
 * after the last successful network check. The buyer name and email are not kept.
 */
import { siteConfig } from "../config.js";

const API = "https://api.lemonsqueezy.com/v1/licenses";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Last successful check still counts while the browser is offline. */
export const LEMON_OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** A stored time this far ahead can be clock skew. Further ahead is not grace. */
export const LEMON_CLOCK_SKEW_MS = 5 * 60 * 1000;

function fail(reason) {
  return { ok: false, reason };
}

export function isLemonSqueezyKey(value) {
  return UUID.test(String(value ?? "").trim());
}

export function sameLicenseKey(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

export function licenseStorageRecord(code, result) {
  return {
    code: String(code || ""),
    provider: "lemonsqueezy",
    instanceId: result?.payload?.instanceId || "",
    validatedAt: result?.payload?.validatedAt || 0,
  };
}

function lemonConfig(options) {
  const config = options.lemonSqueezy || siteConfig.lemonSqueezy;
  if (!config?.storeId || !config?.productId) return null;
  if (!Array.isArray(config.variantIds) || config.variantIds.length === 0) return null;
  return config;
}

function browserName(userAgent) {
  const ua = String(userAgent || "");
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\/|Chromium\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "browser";
}

function instanceName(options) {
  if (options.instanceName) return options.instanceName;
  const ua = options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return `Ribbonwren Bingo - ${browserName(ua)}`;
}

function hasMeta(meta) {
  return Boolean(meta && (meta.store_id != null || meta.product_id != null || meta.variant_id != null));
}

function metaMatches(meta, config) {
  if (Number(meta.store_id) !== Number(config.storeId)) return false;
  if (Number(meta.product_id) !== Number(config.productId)) return false;
  return config.variantIds.map(Number).includes(Number(meta.variant_id));
}

function failureReason(json) {
  const error = String(json?.error || json?.message || "");
  const status = String(json?.license_key?.status || "").toLowerCase();
  if (/activation limit/i.test(error)) return "lemon-limit";
  if (status === "disabled" || status === "expired" || /disabled|refund|expired/i.test(error)) return "lemon-disabled";
  if (/instance/i.test(error)) return "lemon-instance";
  return "lemon-invalid";
}

function expired(json, now) {
  const raw = json?.license_key?.expires_at;
  if (!raw) return false;
  const time = Date.parse(raw);
  return Number.isFinite(time) && time <= now;
}

async function postLicense(action, fields, fetchFn) {
  if (typeof fetchFn !== "function") return { network: true };
  let response;
  try {
    response = await fetchFn(`${API}/${action}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    return { network: true };
  }
  if (response.status >= 500 || response.status === 429) return { network: true, status: response.status };
  let json = null;
  try {
    json = await response.json();
  } catch {
    return { network: true, status: response.status };
  }
  if (!json || typeof json !== "object") return { network: true, status: response.status };
  return { status: response.status, json };
}

function successResult(json, instanceId, validatedAt) {
  return {
    ok: true,
    kind: "lemonsqueezy",
    payload: {
      v: 1,
      tier: "pro",
      id: json?.license_key?.id != null ? `LS-${json.license_key.id}` : "LS-key",
      n: "",
      provider: "lemonsqueezy",
      instanceId: instanceId || json?.instance?.id || "",
      validatedAt,
    },
  };
}

function offlineResult(instanceId, validatedAt) {
  return {
    ok: true,
    offline: true,
    kind: "lemonsqueezy",
    payload: {
      v: 1,
      tier: "pro",
      id: "LS-offline",
      n: "",
      provider: "lemonsqueezy",
      instanceId,
      validatedAt,
    },
  };
}

function trustedActivation(key, stored) {
  if (!stored || stored.provider !== "lemonsqueezy") return null;
  if (!sameLicenseKey(stored.code, key)) return null;
  if (!isLemonSqueezyKey(stored.instanceId)) return null;
  return stored;
}

function offlineOrNetwork(key, stored, now) {
  const trusted = trustedActivation(key, stored);
  const validatedAt = Number(trusted?.validatedAt);
  if (!trusted || !Number.isFinite(validatedAt) || validatedAt <= 0) return fail("lemon-network");
  if (validatedAt > now + LEMON_CLOCK_SKEW_MS) return fail("lemon-network");
  if (now - Math.min(validatedAt, now) > LEMON_OFFLINE_GRACE_MS) return fail("lemon-network");
  return offlineResult(trusted.instanceId, Math.min(validatedAt, now));
}

export async function verifyLemonSqueezyLicense(key, options = {}) {
  const raw = String(key ?? "").trim();
  if (!raw) return fail("empty");
  const config = lemonConfig(options);
  if (!config) return fail("not-configured");
  if (!isLemonSqueezyKey(raw)) return fail("lemon-invalid");

  const now = options.now ?? Date.now();
  const trusted = trustedActivation(raw, options.stored);
  const instanceId = trusted?.instanceId || "";
  if (!instanceId && !options.allowActivate) return fail("lemon-instance");
  const fetchFn = options.fetch || globalThis.fetch;
  const action = instanceId ? "validate" : "activate";
  const fields = instanceId
    ? { license_key: raw, instance_id: instanceId }
    : { license_key: raw, instance_name: instanceName(options) };
  const result = await postLicense(action, fields, fetchFn);
  if (result.network) return offlineOrNetwork(raw, trusted, now);

  const json = result.json;
  if (action === "validate" && (result.status === 404 || failureReason(json) === "lemon-instance")) {
    // The device was removed (dashboard, another browser, or a bad id).
    // Do not spend a new activation. The buyer has to paste the key again.
    return fail("lemon-instance");
  }
  if (hasMeta(json.meta) && !metaMatches(json.meta, config)) {
    if (action === "activate" && json.activated === true && json.instance?.id) {
      await postLicense("deactivate", { license_key: raw, instance_id: json.instance.id }, fetchFn);
    }
    return fail("lemon-mismatch");
  }

  const accepted = action === "activate" ? json.activated === true : json.valid === true;
  const status = String(json?.license_key?.status || "").toLowerCase();
  if (!accepted || status === "disabled" || status === "expired" || expired(json, now)) {
    const reason = failureReason(json);
    if (status === "disabled" || status === "expired" || expired(json, now)) return fail("lemon-disabled");
    return fail(reason);
  }

  if (!hasMeta(json.meta) || !metaMatches(json.meta, config)) {
    if (action === "activate" && json.instance?.id) {
      await postLicense("deactivate", { license_key: raw, instance_id: json.instance.id }, fetchFn);
    }
    return fail("lemon-mismatch");
  }
  const savedInstance = json.instance?.id || instanceId;
  if (!savedInstance) return fail("lemon-invalid");
  return successResult(json, savedInstance, now);
}

export async function deactivateLemonSqueezyLicense(key, instanceId, options = {}) {
  const raw = String(key ?? "").trim();
  if (!isLemonSqueezyKey(raw) || !instanceId) return fail("lemon-invalid");
  const result = await postLicense(
    "deactivate",
    { license_key: raw, instance_id: instanceId },
    options.fetch || globalThis.fetch,
  );
  if (result.network) return fail("lemon-network");
  if (result.json?.deactivated === true) return { ok: true };
  return fail(failureReason(result.json));
}
