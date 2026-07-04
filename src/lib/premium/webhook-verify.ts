import { createHmac, timingSafeEqual } from 'crypto';

export interface VerifyStandardWebhookArgs {
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowMs?: number;
  toleranceSec?: number;
}

/**
 * Verify a Standard Webhooks (https://www.standardwebhooks.com) signature,
 * the scheme Dodo Payments uses. Signed content is `${id}.${timestamp}.${payload}`,
 * HMAC-SHA256 with the base64-decoded key from a `whsec_...` secret. The
 * signature header may carry several space-delimited `v1,<base64>` entries;
 * any constant-time match passes. Timestamps outside the tolerance window fail.
 */
export function verifyStandardWebhook(args: VerifyStandardWebhookArgs): boolean {
  try {
    const { payload, id, timestamp, signature, secret } = args;
    if (!payload || !id || !timestamp || !signature || !secret) return false;

    const toleranceSec = args.toleranceSec ?? 300;
    const nowMs = args.nowMs ?? Date.now();
    const tsSec = Number(timestamp);
    if (!Number.isFinite(tsSec)) return false;
    if (Math.abs(nowMs / 1000 - tsSec) > toleranceSec) return false;

    const secretPart = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const key = Buffer.from(secretPart, 'base64');
    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest();

    for (const entry of signature.split(' ')) {
      const [version, sig] = entry.split(',');
      if (version !== 'v1' || !sig) continue;
      const candidate = Buffer.from(sig, 'base64');
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
