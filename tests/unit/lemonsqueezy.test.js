import { describe, expect, it } from "vitest";
import { siteConfig } from "../../src/config.js";
import { verifyCode } from "../../src/unlock/verify.js";
import {
  LEMON_CLOCK_SKEW_MS,
  LEMON_OFFLINE_GRACE_MS,
  deactivateLemonSqueezyLicense,
  isLemonSqueezyKey,
  licenseStorageRecord,
  verifyLemonSqueezyLicense,
} from "../../src/unlock/lemonsqueezy.js";
import { SLOT_NOT_FREED, maskedKeyLabel, unlockError } from "../../src/ui/messages.js";
import { loadUnlock, saveUnlock } from "../../src/unlock/storage.js";

const KEY = "38b1460a-5104-4067-a91d-77b872934d51";
const INSTANCE = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";
const NOW = Date.parse("2026-10-18T00:00:00Z");

function body(overrides = {}) {
  return {
    activated: true,
    valid: true,
    error: null,
    license_key: {
      id: 42,
      status: "active",
      key: KEY,
      activation_limit: 3,
      activation_usage: 1,
      expires_at: null,
      ...(overrides.license_key || {}),
    },
    instance: { id: INSTANCE, name: "Ribbonwren Bingo - Chrome", ...(overrides.instance || {}) },
    meta: {
      store_id: siteConfig.lemonSqueezy.storeId,
      product_id: siteConfig.lemonSqueezy.productId,
      variant_id: siteConfig.lemonSqueezy.variantIds[0],
      customer_name: "Sarah Buyer",
      customer_email: "sarah.buyer@example.com",
      ...(overrides.meta || {}),
    },
    ...strip(overrides),
  };
}

function strip(overrides) {
  const copy = { ...overrides };
  delete copy.license_key;
  delete copy.instance;
  delete copy.meta;
  return copy;
}

function record(overrides = {}) {
  return {
    provider: "lemonsqueezy",
    code: KEY,
    instanceId: INSTANCE,
    validatedAt: NOW - 1000,
    ...overrides,
  };
}

function mockFetch(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, body: String(init?.body || "") });
    const result = await handler({ url, body: calls.at(-1).body, calls });
    return {
      status: result.status ?? 200,
      json: async () => result.json,
    };
  };
  return { fetchFn, calls };
}

describe("Lemon Squeezy licenses", () => {
  it("detects a UUID key and ignores a signed code", () => {
    expect(isLemonSqueezyKey(`  ${KEY.toUpperCase()}  `)).toBe(true);
    expect(isLemonSqueezyKey("not-a-key")).toBe(false);
    expect(isLemonSqueezyKey("payload.signature")).toBe(false);
  });

  it("activates a matching key and does not keep the buyer name or email", async () => {
    const { fetchFn, calls } = mockFetch(async () => ({ json: body() }));
    const result = await verifyLemonSqueezyLicense(KEY, {
      fetch: fetchFn,
      now: NOW,
      allowActivate: true,
      userAgent: "Mozilla/5.0 Chrome/120.0",
    });
    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({
      tier: "pro",
      n: "",
      provider: "lemonsqueezy",
      instanceId: INSTANCE,
      validatedAt: NOW,
    });
    expect(JSON.stringify(result)).not.toContain("sarah.buyer@example.com");
    expect(JSON.stringify(result)).not.toContain("Sarah Buyer");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.lemonsqueezy.com/v1/licenses/activate");
    expect(calls[0].body).toContain(`license_key=${KEY}`);
    expect(calls[0].body).toContain("instance_name=Ribbonwren+Bingo+-+Chrome");
    const stored = licenseStorageRecord(KEY, result);
    expect(Object.keys(stored).sort()).toEqual(["code", "instanceId", "provider", "validatedAt"]);
    expect(stored).not.toHaveProperty("n");
    const memory = new Map();
    globalThis.localStorage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };
    saveUnlock(stored, "pro");
    expect(loadUnlock("pro")).toEqual(stored);
    expect(JSON.stringify(loadUnlock("pro"))).not.toContain("example.com");
  });

  it("validates a stored instance instead of activating again", async () => {
    const { fetchFn, calls } = mockFetch(async () => ({ json: body() }));
    const result = await verifyLemonSqueezyLicense(KEY, {
      fetch: fetchFn,
      now: NOW,
      stored: record(),
    });
    expect(result.ok).toBe(true);
    expect(result.offline).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/validate");
    expect(calls[0].body).toContain(`instance_id=${INSTANCE}`);
    expect(calls[0].body).not.toContain("instance_name");
  });

  it("rejects a store, product, or variant mismatch and releases a new activation", async () => {
    for (const meta of [
      { store_id: 1, product_id: siteConfig.lemonSqueezy.productId, variant_id: 2262220 },
      { store_id: 500556, product_id: 9, variant_id: 2262220 },
      { store_id: 500556, product_id: 1449237, variant_id: 5 },
    ]) {
      const { fetchFn, calls } = mockFetch(async ({ url }) => {
        if (url.endsWith("/deactivate")) return { json: { deactivated: true } };
        return { json: body({ meta }) };
      });
      const result = await verifyLemonSqueezyLicense(KEY, { fetch: fetchFn, now: NOW, allowActivate: true });
      expect(result).toEqual({ ok: false, reason: "lemon-mismatch" });
      expect(calls.map((call) => call.url.endsWith("/deactivate"))).toEqual([false, true]);
    }
  });

  it("does not unlock when the success payload has no store metadata", async () => {
    const { fetchFn, calls } = mockFetch(async ({ url }) => {
      if (url.endsWith("/deactivate")) return { json: { deactivated: true } };
      const json = body();
      delete json.meta;
      return { json };
    });
    const result = await verifyLemonSqueezyLicense(KEY, { fetch: fetchFn, now: NOW, allowActivate: true });
    expect(result.reason).toBe("lemon-mismatch");
    expect(calls.some((call) => call.url.endsWith("/deactivate"))).toBe(true);
  });

  it("reports the activation limit, a disabled or refunded key, and an unknown key", async () => {
    const limit = mockFetch(async () => ({
      json: body({
        activated: false,
        error: "This license key has reached the activation limit.",
        license_key: { status: "active", activation_limit: 3 },
      }),
    }));
    expect((await verifyLemonSqueezyLicense(KEY, { fetch: limit.fetchFn, now: NOW, allowActivate: true })).reason).toBe("lemon-limit");
    expect(unlockError("lemon-limit")).toContain("3 devices");

    const disabled = mockFetch(async () => ({
      json: body({
        activated: false,
        error: "This license key has been disabled.",
        license_key: { status: "disabled" },
      }),
    }));
    expect((await verifyLemonSqueezyLicense(KEY, { fetch: disabled.fetchFn, now: NOW, allowActivate: true })).reason).toBe("lemon-disabled");

    const refunded = mockFetch(async () => ({
      json: body({ activated: false, valid: false, error: "Order refunded.", license_key: { status: "disabled" } }),
    }));
    expect((await verifyLemonSqueezyLicense(KEY, {
      fetch: refunded.fetchFn,
      now: NOW,
      stored: record({ validatedAt: NOW }),
    })).reason).toBe("lemon-disabled");

    const missing = mockFetch(async () => ({
      status: 404,
      json: { activated: false, error: "license_key not found." },
    }));
    expect((await verifyLemonSqueezyLicense(KEY, { fetch: missing.fetchFn, now: NOW, allowActivate: true })).reason).toBe("lemon-invalid");
    expect(missing.calls).toHaveLength(1);
  });

  it("keeps a recent check unlocked when the network fails, and stops after the grace period", async () => {
    const offline = async () => {
      throw new Error("offline");
    };
    const fresh = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW - (LEMON_OFFLINE_GRACE_MS - 1000) }),
    });
    expect(fresh.ok).toBe(true);
    expect(fresh.offline).toBe(true);
    expect(fresh.payload.validatedAt).toBe(NOW - (LEMON_OFFLINE_GRACE_MS - 1000));
    expect(JSON.stringify(fresh)).not.toContain("example.com");

    const edge = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW - LEMON_OFFLINE_GRACE_MS }),
    });
    expect(edge.ok).toBe(true);

    const stale = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW - LEMON_OFFLINE_GRACE_MS - 1 }),
    });
    expect(stale).toEqual({ ok: false, reason: "lemon-network" });

    const first = await verifyLemonSqueezyLicense(KEY, { fetch: offline, now: NOW, allowActivate: true });
    expect(first).toEqual({ ok: false, reason: "lemon-network" });

    const down = mockFetch(async () => ({ status: 503, json: { error: "unavailable" } }));
    const graceless = await verifyLemonSqueezyLicense(KEY, {
      fetch: down.fetchFn,
      now: NOW,
      stored: record({ validatedAt: NOW - LEMON_OFFLINE_GRACE_MS - 1 }),
    });
    expect(graceless.reason).toBe("lemon-network");
  });

  it("refuses grace for a future timestamp, a made-up instance, and a different key", async () => {
    const offline = async () => {
      throw new Error("offline");
    };
    const future = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW + LEMON_CLOCK_SKEW_MS + 1 }),
    });
    expect(future).toEqual({ ok: false, reason: "lemon-network" });

    const skew = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW + LEMON_CLOCK_SKEW_MS }),
    });
    expect(skew.ok).toBe(true);
    expect(skew.payload.validatedAt).toBe(NOW);
    expect(skew.payload.validatedAt).toBeLessThanOrEqual(NOW);

    const madeUp = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ instanceId: "made-up" }),
    });
    expect(madeUp).toEqual({ ok: false, reason: "lemon-instance" });

    const madeUpSubmit = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      allowActivate: true,
      stored: record({ instanceId: "x" }),
    });
    expect(madeUpSubmit).toEqual({ ok: false, reason: "lemon-network" });

    const otherKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const mismatched = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ code: otherKey }),
    });
    expect(mismatched).toEqual({ ok: false, reason: "lemon-instance" });

    const yearAhead = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      stored: record({ validatedAt: NOW + 365 * 24 * 60 * 60 * 1000 }),
    });
    expect(yearAhead).toEqual({ ok: false, reason: "lemon-network" });

    const bare = await verifyLemonSqueezyLicense(KEY, {
      fetch: offline,
      now: NOW,
      instanceId: INSTANCE,
      validatedAt: NOW + 86400000,
    });
    expect(bare).toEqual({ ok: false, reason: "lemon-instance" });
  });

  it("rejects a test-mode key when the store is live and still accepts one in test mode", async () => {
    const live = { ...siteConfig.lemonSqueezy, mode: "live" };
    const activated = mockFetch(async ({ url }) => {
      if (url.endsWith("/deactivate")) return { json: { deactivated: true } };
      return { json: body({ license_key: { test_mode: true } }) };
    });
    const blocked = await verifyLemonSqueezyLicense(KEY, {
      fetch: activated.fetchFn,
      now: NOW,
      allowActivate: true,
      lemonSqueezy: live,
    });
    expect(blocked).toEqual({ ok: false, reason: "lemon-test" });
    expect(activated.calls.map((call) => call.url.split("/").pop())).toEqual(["activate", "deactivate"]);
    expect(unlockError("lemon-test")).toBe("This is a test license key, so it can't unlock the live site.");

    const checked = mockFetch(async () => ({ json: body({ license_key: { test_mode: true }, valid: true }) }));
    const validated = await verifyLemonSqueezyLicense(KEY, {
      fetch: checked.fetchFn,
      now: NOW,
      stored: record(),
      lemonSqueezy: live,
    });
    expect(validated).toEqual({ ok: false, reason: "lemon-test" });
    expect(checked.calls.map((call) => call.url.split("/").pop())).toEqual(["validate"]);

    const allowed = mockFetch(async () => ({ json: body({ license_key: { test_mode: true } }) }));
    const testStore = await verifyLemonSqueezyLicense(KEY, {
      fetch: allowed.fetchFn,
      now: NOW,
      allowActivate: true,
    });
    expect(testStore.ok).toBe(true);
    expect(allowed.calls).toHaveLength(1);
  });

  it("does not activate when validate returns 404 or the instance is gone", async () => {
    const missing = mockFetch(async () => ({ status: 404, json: { valid: false, error: "not found" } }));
    const gone = await verifyLemonSqueezyLicense(KEY, {
      fetch: missing.fetchFn,
      now: NOW,
      allowActivate: true,
      stored: record(),
    });
    expect(gone).toEqual({ ok: false, reason: "lemon-instance" });
    expect(missing.calls.map((call) => call.url.split("/").pop())).toEqual(["validate"]);
    expect(unlockError("lemon-instance")).toBe("This device is no longer activated. Paste your license key to activate it again.");

    const named = mockFetch(async () => ({ json: { valid: false, error: "instance_id not found." } }));
    const lost = await verifyLemonSqueezyLicense(KEY, {
      fetch: named.fetchFn,
      now: NOW,
      allowActivate: true,
      stored: record({ instanceId: "11111111-1111-4111-8111-111111111111", validatedAt: NOW }),
    });
    expect(lost).toEqual({ ok: false, reason: "lemon-instance" });
    expect(named.calls.map((call) => call.url.split("/").pop())).toEqual(["validate"]);
  });

  it("does not call activate until the buyer submits the key", async () => {
    const { fetchFn, calls } = mockFetch(async () => ({ json: body() }));
    const blocked = await verifyLemonSqueezyLicense(KEY, { fetch: fetchFn, now: NOW });
    expect(blocked).toEqual({ ok: false, reason: "lemon-instance" });
    expect(calls).toHaveLength(0);
    expect(maskedKeyLabel(KEY)).toBe("Key ending in …4d51");
    expect(SLOT_NOT_FREED).toBe("Couldn't free this device's slot. Try again online, or contact support.");
  });

  it("deactivates this device and reports a network failure", async () => {
    const ok = mockFetch(async () => ({ json: { deactivated: true, error: null, meta: { customer_email: "sarah.buyer@example.com" } } }));
    const done = await deactivateLemonSqueezyLicense(KEY, INSTANCE, { fetch: ok.fetchFn });
    expect(done).toEqual({ ok: true });
    expect(ok.calls[0].url).toContain("/deactivate");
    expect(ok.calls[0].body).toContain(`license_key=${KEY}`);
    expect(ok.calls[0].body).toContain(`instance_id=${INSTANCE}`);

    const down = await deactivateLemonSqueezyLicense(KEY, INSTANCE, {
      fetch: async () => {
        throw new Error("offline");
      },
    });
    expect(down).toEqual({ ok: false, reason: "lemon-network" });
    const missingInstance = mockFetch(async () => ({
      status: 404,
      json: { deactivated: false, error: "instance_id not found." },
    }));
    expect(await deactivateLemonSqueezyLicense(KEY, INSTANCE, { fetch: missingInstance.fetchFn })).toEqual({
      ok: false,
      reason: "lemon-instance",
    });
    expect(await deactivateLemonSqueezyLicense("nope", INSTANCE, { fetch: ok.fetchFn })).toEqual({
      ok: false,
      reason: "lemon-invalid",
    });
  });

  it("routes a UUID through the license check and leaves a dotted code on the signed path", async () => {
    let calls = 0;
    const externalVerify = async (key) => {
      calls += 1;
      expect(key).toBe(KEY);
      return { ok: false, reason: "lemon-invalid" };
    };
    expect((await verifyCode(KEY, { externalVerify })).reason).toBe("lemon-invalid");
    expect((await verifyCode("payload.signature", { externalVerify })).reason).not.toBe("lemon-invalid");
    expect(calls).toBe(1);
    expect((await verifyCode("not-a-key")).reason).toBe("not-configured");
  });
});
