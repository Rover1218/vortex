import { describe, it, expect } from 'vitest';
import { generateCouponCode, normalizeCouponCode, hashCouponCode } from '../coupons';

describe('generateCouponCode', () => {
  it('matches the VTX-XXXX-XXXX-XXXX format without ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCouponCode()).toMatch(/^VTX(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){3}$/);
    }
  });

  it('produces distinct codes', () => {
    const codes = new Set(Array.from({ length: 100 }, generateCouponCode));
    expect(codes.size).toBe(100);
  });
});

describe('normalizeCouponCode', () => {
  it('is case/dash/whitespace insensitive and drops the VTX prefix', () => {
    expect(normalizeCouponCode('vtx-AB2C-de3f-GH4J ')).toBe('AB2CDE3FGH4J');
    expect(normalizeCouponCode('AB2C DE3F GH4J')).toBe('AB2CDE3FGH4J');
  });
});

describe('hashCouponCode', () => {
  it('hashes equivalent user inputs identically', () => {
    const a = hashCouponCode('VTX-AB2C-DE3F-GH4J');
    const b = hashCouponCode('vtx ab2c de3f gh4j');
    expect(a).toBe(b);
  });

  it('returns 64 hex characters', () => {
    expect(hashCouponCode(generateCouponCode())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different codes', () => {
    expect(hashCouponCode('VTX-AAAA-AAAA-AAAA')).not.toBe(hashCouponCode('VTX-AAAA-AAAA-AAAB'));
  });
});
