export type PlanId = 'monthly' | 'halfyear' | 'lifetime';

export interface PlanInfo {
  id: PlanId;
  label: string;
  durationDays: number | null; // null = lifetime
  inr: number;
  usd: number;
  tagline: string;
}

export const PLANS: Record<PlanId, PlanInfo> = {
  monthly: { id: 'monthly', label: '1 Month', durationDays: 30, inr: 89, usd: 1, tagline: 'Try everything' },
  halfyear: { id: 'halfyear', label: '6 Months', durationDays: 180, inr: 449, usd: 5, tagline: 'Most popular' },
  lifetime: { id: 'lifetime', label: 'Lifetime', durationDays: null, inr: 3299, usd: 40, tagline: 'Best value' },
};

export const FREE_MAX_ACTIVE_DOWNLOADS = 2;

// Free-tier download speed cap in MB/s (the engine's globalDownloadLimit unit).
// Premium/lifetime accounts may set any limit including "unlimited".
export const FREE_MAX_DOWNLOAD_MBPS = 2;

// Premium "unlimited" is sent to the engine as this large FINITE MB/s value,
// not 0. The engine's throttle updates reliably between finite rates while a
// download is live, but setting it to Infinity (the 0 path) fails to release
// already-throttled peer connections until the engine restarts. A finite value
// far above any real connection is effectively unlimited and applies instantly.
export const UNLIMITED_SENTINEL_MBPS = 5000;

// Extra days added to a user's FIRST-ever payment (not coupons, not lifetime).
export const FIRST_PURCHASE_BONUS_DAYS = 30;

export const COUPON_DURATIONS: { label: string; durationDays: number | null }[] = [
  { label: '1 Month', durationDays: 30 },
  { label: '3 Months', durationDays: 90 },
  { label: '6 Months', durationDays: 180 },
  { label: '1 Year', durationDays: 365 },
  { label: 'Lifetime', durationDays: null },
];

export function isPlanId(value: unknown): value is PlanId {
  return value === 'monthly' || value === 'halfyear' || value === 'lifetime';
}
