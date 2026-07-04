import { describe, it, expect } from 'vitest';
import { computeGrant, isPremiumActive, withFirstPurchaseBonus, type EntitlementCore } from '../entitlement';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000;

describe('computeGrant', () => {
  it('starts from now when there is no current entitlement', () => {
    const result = computeGrant(null, { durationDays: 30 }, NOW);
    expect(result).toEqual({ isLifetime: false, premiumUntilMs: NOW + 30 * DAY });
  });

  it('starts from now when the current entitlement is expired', () => {
    const current: EntitlementCore = { isLifetime: false, premiumUntilMs: NOW - 5 * DAY };
    const result = computeGrant(current, { durationDays: 30 }, NOW);
    expect(result.premiumUntilMs).toBe(NOW + 30 * DAY);
  });

  it('stacks on top of remaining time when still active', () => {
    const current: EntitlementCore = { isLifetime: false, premiumUntilMs: NOW + 10 * DAY };
    const result = computeGrant(current, { durationDays: 180 }, NOW);
    expect(result.premiumUntilMs).toBe(NOW + 190 * DAY);
  });

  it('grants lifetime', () => {
    const result = computeGrant(null, { lifetime: true }, NOW);
    expect(result).toEqual({ isLifetime: true, premiumUntilMs: null });
  });

  it('never downgrades an existing lifetime entitlement', () => {
    const current: EntitlementCore = { isLifetime: true, premiumUntilMs: null };
    const result = computeGrant(current, { durationDays: 30 }, NOW);
    expect(result).toEqual({ isLifetime: true, premiumUntilMs: null });
  });
});

describe('withFirstPurchaseBonus', () => {
  it('adds bonus days to a timed grant on the first purchase', () => {
    expect(withFirstPurchaseBonus({ durationDays: 30 }, true, 30)).toEqual({
      grant: { durationDays: 60 },
      bonusDays: 30,
    });
    expect(withFirstPurchaseBonus({ durationDays: 180 }, true, 30)).toEqual({
      grant: { durationDays: 210 },
      bonusDays: 30,
    });
  });

  it('gives no bonus on repeat purchases', () => {
    expect(withFirstPurchaseBonus({ durationDays: 30 }, false, 30)).toEqual({
      grant: { durationDays: 30 },
      bonusDays: 0,
    });
  });

  it('leaves lifetime grants untouched even on first purchase', () => {
    expect(withFirstPurchaseBonus({ lifetime: true }, true, 30)).toEqual({
      grant: { lifetime: true },
      bonusDays: 0,
    });
  });
});

describe('isPremiumActive', () => {
  it('is false for a missing entitlement', () => {
    expect(isPremiumActive(null, NOW)).toBe(false);
  });

  it('is false when expired', () => {
    expect(isPremiumActive({ isLifetime: false, premiumUntilMs: NOW - 1 }, NOW)).toBe(false);
  });

  it('is true while active', () => {
    expect(isPremiumActive({ isLifetime: false, premiumUntilMs: NOW + 1 }, NOW)).toBe(true);
  });

  it('is true for lifetime regardless of expiry field', () => {
    expect(isPremiumActive({ isLifetime: true, premiumUntilMs: null }, NOW)).toBe(true);
  });
});
