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

export function isPlanId(value: unknown): value is PlanId {
  return value === 'monthly' || value === 'halfyear' || value === 'lifetime';
}
