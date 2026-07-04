import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyStandardWebhook } from '../webhook-verify';

const KEY = Buffer.from('super-secret-webhook-key-32bytes!').toString('base64');
const SECRET = `whsec_${KEY}`;
const NOW = 1_750_000_000_000;
const TIMESTAMP = String(Math.floor(NOW / 1000));

function sign(payload: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

describe('verifyStandardWebhook', () => {
  const payload = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });

  it('accepts a valid signature', () => {
    const signature = sign(payload, 'msg_1', TIMESTAMP);
    expect(
      verifyStandardWebhook({ payload, id: 'msg_1', timestamp: TIMESTAMP, signature, secret: SECRET, nowMs: NOW }),
    ).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const signature = sign(payload, 'msg_1', TIMESTAMP, `whsec_${Buffer.from('wrong-key').toString('base64')}`);
    expect(
      verifyStandardWebhook({ payload, id: 'msg_1', timestamp: TIMESTAMP, signature, secret: SECRET, nowMs: NOW }),
    ).toBe(false);
  });

  it('rejects stale timestamps outside the tolerance window', () => {
    const stale = String(Math.floor(NOW / 1000) - 3600);
    const signature = sign(payload, 'msg_1', stale);
    expect(
      verifyStandardWebhook({ payload, id: 'msg_1', timestamp: stale, signature, secret: SECRET, nowMs: NOW }),
    ).toBe(false);
  });

  it('accepts when any of several space-delimited signatures matches', () => {
    const good = sign(payload, 'msg_1', TIMESTAMP);
    const signature = `v1,${Buffer.from('garbage-signature').toString('base64')} ${good}`;
    expect(
      verifyStandardWebhook({ payload, id: 'msg_1', timestamp: TIMESTAMP, signature, secret: SECRET, nowMs: NOW }),
    ).toBe(true);
  });

  it('returns false (not throw) on malformed input', () => {
    expect(
      verifyStandardWebhook({ payload, id: 'msg_1', timestamp: 'not-a-number', signature: '???', secret: SECRET, nowMs: NOW }),
    ).toBe(false);
    expect(
      verifyStandardWebhook({ payload: '', id: '', timestamp: '', signature: '', secret: '', nowMs: NOW }),
    ).toBe(false);
  });
});
