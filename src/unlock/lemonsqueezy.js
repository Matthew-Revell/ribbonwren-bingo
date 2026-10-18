/**
 * Phase 2 hook. Matthew has not approved a payment processor, so this
 * function does not call the network and does not read a store id.
 *
 * When a processor is approved, implement the check here and pass it as
 * `externalVerify` from siteConfig.externalCodeType. For Lemon Squeezy that
 * later check should:
 *   - activate, then validate, from the browser
 *   - require the configured store id and product id
 *   - keep only valid, those ids, and instance id (no name, no email)
 *   - re-check at most every 30 days
 *   - keep working offline if a later check cannot connect
 * Gumroad, or another seller, can be a sibling module with the same shape.
 */
export async function verifyLemonSqueezyLicense() {
  return { ok: false, reason: "not-configured" };
}
