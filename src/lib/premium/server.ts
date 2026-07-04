import { NextRequest } from 'next/server';
import { Timestamp, FieldValue, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { computeGrant, withFirstPurchaseBonus, type EntitlementCore, type Grant } from './entitlement';
import { FIRST_PURCHASE_BONUS_DAYS } from './plans';
import { hashCouponCode, normalizeCouponCode } from './coupons';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function requireUser(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in required');
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    throw new HttpError(401, 'Session expired. Sign in again.');
  }
}

export async function requireAdmin(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const user = await requireUser(req);
  const adminUid = process.env.ADMIN_UID;
  if (!adminUid || user.uid !== adminUid) throw new HttpError(403, 'Not allowed');
  return user;
}

export function entitlementRef(uid: string) {
  return adminDb.collection('users').doc(uid).collection('config').doc('entitlement');
}

function toCore(data: DocumentData | undefined): EntitlementCore | null {
  if (!data) return null;
  return {
    isLifetime: !!data.isLifetime,
    premiumUntilMs: data.premiumUntil instanceof Timestamp ? data.premiumUntil.toMillis() : null,
  };
}

function applyGrantTxn(
  txn: Transaction,
  uid: string,
  current: EntitlementCore | null,
  grant: Grant,
  source: 'payment' | 'coupon' | 'admin',
  planLabel: string,
) {
  const next = computeGrant(current, grant, Date.now());
  txn.set(entitlementRef(uid), {
    plan: next.isLifetime ? 'lifetime' : planLabel,
    isLifetime: next.isLifetime,
    premiumUntil: next.premiumUntilMs === null ? null : Timestamp.fromMillis(next.premiumUntilMs),
    source,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function applyGrant(
  uid: string,
  grant: Grant,
  source: 'payment' | 'coupon' | 'admin',
  planLabel: string,
): Promise<void> {
  await adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(entitlementRef(uid));
    applyGrantTxn(txn, uid, toCore(snap.data()), grant, source, planLabel);
  });
}

/**
 * Idempotently credit a payment: records the payment audit doc and extends the
 * entitlement in ONE transaction, so webhook retries can never double-credit
 * and a failed grant is retried together with its payment record.
 * A user's first-ever payment (judged by the payments ledger, so coupons don't
 * count) gets FIRST_PURCHASE_BONUS_DAYS extra on timed plans.
 * `credited` is false when the payment was already processed.
 */
export async function grantPaymentOnce(
  eventKey: string,
  uid: string,
  grant: Grant,
  planLabel: string,
  record: Record<string, unknown>,
): Promise<{ credited: boolean; bonusDays: number }> {
  const payRef = adminDb.collection('payments').doc(eventKey);
  const priorPaymentQuery = adminDb.collection('payments').where('uid', '==', uid).limit(1);
  return adminDb.runTransaction(async (txn) => {
    const [paySnap, entSnap, priorSnap] = await Promise.all([
      txn.get(payRef),
      txn.get(entitlementRef(uid)),
      txn.get(priorPaymentQuery),
    ]);
    if (paySnap.exists) return { credited: false, bonusDays: 0 };

    const { grant: effectiveGrant, bonusDays } = withFirstPurchaseBonus(
      grant,
      priorSnap.empty,
      FIRST_PURCHASE_BONUS_DAYS,
    );
    txn.set(payRef, { ...record, firstPurchaseBonusDays: bonusDays, createdAt: FieldValue.serverTimestamp() });
    applyGrantTxn(txn, uid, toCore(entSnap.data()), effectiveGrant, 'payment', planLabel);
    return { credited: true, bonusDays };
  });
}

const REDEEM_WINDOW_MS = 60 * 60 * 1000;
const REDEEM_MAX_ATTEMPTS = 10;

export async function checkRedeemRateLimit(uid: string): Promise<void> {
  const ref = adminDb.collection('couponAttempts').doc(uid);
  await adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const now = Date.now();
    const data = snap.data();
    if (!data || now - Number(data.windowStartMs || 0) > REDEEM_WINDOW_MS) {
      txn.set(ref, { count: 1, windowStartMs: now });
      return;
    }
    if (Number(data.count || 0) >= REDEEM_MAX_ATTEMPTS) {
      throw new HttpError(429, 'Too many attempts. Try again in an hour.');
    }
    txn.update(ref, { count: FieldValue.increment(1) });
  });
}

export async function redeemCoupon(uid: string, rawCode: string): Promise<{ durationDays: number | null }> {
  if (normalizeCouponCode(rawCode).length !== 12) throw new HttpError(404, 'Invalid code');
  const couponRef = adminDb.collection('coupons').doc(hashCouponCode(rawCode));
  return adminDb.runTransaction(async (txn) => {
    const [couponSnap, entSnap] = await Promise.all([txn.get(couponRef), txn.get(entitlementRef(uid))]);
    if (!couponSnap.exists) throw new HttpError(404, 'Invalid code');
    const coupon = couponSnap.data()!;
    if (coupon.revoked) throw new HttpError(410, 'This code has been revoked');
    if (coupon.redeemedBy) throw new HttpError(409, 'This code has already been used');

    const isLifetime = !!coupon.isLifetime;
    const durationDays: number | null = isLifetime ? null : Number(coupon.durationDays);
    const grant: Grant = isLifetime ? { lifetime: true } : { durationDays: durationDays as number };

    txn.update(couponRef, { redeemedBy: uid, redeemedAt: FieldValue.serverTimestamp() });
    applyGrantTxn(txn, uid, toCore(entSnap.data()), grant, 'coupon', 'coupon');
    return { durationDays };
  });
}
