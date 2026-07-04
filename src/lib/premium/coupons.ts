import { createHash, randomInt } from 'crypto';

// No ambiguous characters (I, L, O, 0, 1) so codes survive being read aloud.
export const COUPON_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCouponCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)]).join('');
  return `VTX-${group()}-${group()}-${group()}`;
}

/** Canonical form: uppercase, alphanumerics only, VTX prefix dropped. */
export function normalizeCouponCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.startsWith('VTX') ? cleaned.slice(3) : cleaned;
}

export function hashCouponCode(input: string): string {
  return createHash('sha256').update(normalizeCouponCode(input)).digest('hex');
}
