export interface EntitlementCore {
  isLifetime: boolean;
  premiumUntilMs: number | null;
}

export type Grant = { durationDays: number } | { lifetime: true };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the entitlement that results from applying a grant.
 * Time always stacks: the new expiry extends from whichever is later,
 * "now" or the current expiry. Lifetime is sticky and never downgraded.
 */
export function computeGrant(current: EntitlementCore | null, grant: Grant, nowMs: number): EntitlementCore {
  if (current?.isLifetime) return { isLifetime: true, premiumUntilMs: null };
  if ('lifetime' in grant) return { isLifetime: true, premiumUntilMs: null };
  const base = Math.max(nowMs, current?.premiumUntilMs ?? 0);
  return { isLifetime: false, premiumUntilMs: base + grant.durationDays * MS_PER_DAY };
}

export function isPremiumActive(ent: EntitlementCore | null, nowMs: number): boolean {
  if (!ent) return false;
  if (ent.isLifetime) return true;
  return ent.premiumUntilMs !== null && ent.premiumUntilMs > nowMs;
}
