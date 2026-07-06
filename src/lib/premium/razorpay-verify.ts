import { createHmac, timingSafeEqual } from 'crypto';

export interface VerifyRazorpayWebhookArgs {
  payload: string;
  signature: string;
  secret: string;
}

/**
 * Verify a Razorpay webhook signature: HMAC-SHA256 of the raw request body
 * with the webhook secret, hex-encoded, sent in the `x-razorpay-signature`
 * header. Constant-time comparison; malformed input returns false, never throws.
 */
export function verifyRazorpayWebhook(args: VerifyRazorpayWebhookArgs): boolean {
  try {
    const { payload, signature, secret } = args;
    if (!payload || !signature || !secret) return false;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
