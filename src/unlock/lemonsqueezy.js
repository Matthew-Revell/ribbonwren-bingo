/**
 * Lemon Squeezy public License API. No API key.
 * Activate on the first use, then validate the stored instance.
 * A failed connection can keep Pro unlocked for LEMON_OFFLINE_GRACE_MS
 * after the last successful check. The buyer name and email are not kept.
 */
import { siteConfig } from "../config.js";

const API = "https://api.lemonsqueezy.com/v1/licenses";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Last successful check still counts while the browser is offline. */
export const LEMON_OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

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

function offlineOrNetwork(instanceId, validatedAt, now) {
  if (instanceId && validatedAt && now - validatedAt <= LEMON_OFFLINE_GRACE_MS) {
    return offlineResult(instanceId, validatedAt);
  }
  return fail("lemon-network");
}

export async function verifyLemonSqueezyLicense(key, options = {}) {
  const raw = String(key ?? "").trim();
  if (!raw) return fail("empty");
  const config = lemonConfig(options);
  if (!config) return fail("not-configured");
  if (!isLemonSqueezyKey(raw)) return fail("lemon-invalid");

  const now = options.now ?? Date.now();
  const instanceId = options.instanceId || "";
  const validatedAt = Number(options.validatedAt) || 0;
  const fetchFn = options.fetch || globalThis.fetch;
  const action = instanceId ? "validate" : "activate";
  const fields = instanceId
    ? { license_key: raw, instance_id: instanceId }
    : { license_key: raw, instance_name: instanceName(options) };
  const result = await postLicense(action, fields, fetchFn);
  if (result.network) return offlineOrNetwork(instanceId, validatedAt, now);

  const json = result.json;
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
    if (action === "validate" && reason === "lemon-instance" && !options.retried) {
      return verifyLemonSqueezyLicense(raw, { ...options, instanceId: "", validatedAt: 0, retried: true });
    }
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
