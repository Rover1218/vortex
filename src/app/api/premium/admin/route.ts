import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { requireAdmin, applyGrant, entitlementRef, HttpError } from '@/lib/premium/server';
import { generateCouponCode, hashCouponCode, COUPON_DURATIONS } from '@/lib/premium/coupons';

const MAX_BATCH = 100;

function isValidDuration(durationDays: unknown): durationDays is number | null {
  return COUPON_DURATIONS.some((d) => d.durationDays === durationDays);
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

async function handleGenerate(body: Record<string, unknown>) {
  const count = Number(body.count);
  const durationDays = body.durationDays === null ? null : Number(body.durationDays);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) {
    throw new HttpError(400, `Count must be 1-${MAX_BATCH}`);
  }
  if (!isValidDuration(durationDays)) throw new HttpError(400, 'Invalid duration');

  const batch = adminDb.batch();
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateCouponCode();
    codes.push(code);
    batch.set(adminDb.collection('coupons').doc(hashCouponCode(code)), {
      durationDays,
      isLifetime: durationDays === null,
      createdAt: FieldValue.serverTimestamp(),
      redeemedBy: null,
      redeemedAt: null,
      revoked: false,
    });
  }
  await batch.commit();
  // Plaintext codes exist only in this response — Firestore stores hashes.
  return NextResponse.json({ codes });
}

async function handleList() {
  const snap = await adminDb.collection('coupons').orderBy('createdAt', 'desc').limit(200).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string });

  const uids = [...new Set(docs.map((d) => d.redeemedBy).filter((v): v is string => typeof v === 'string'))];
  const emailByUid: Record<string, string> = {};
  if (uids.length > 0) {
    const result = await adminAuth.getUsers(uids.map((uid) => ({ uid })));
    for (const u of result.users) emailByUid[u.uid] = u.email || u.displayName || u.uid;
  }

  return NextResponse.json({
    coupons: docs.map((d) => ({
      id: d.id,
      durationDays: d.isLifetime ? null : (d.durationDays as number | null),
      isLifetime: !!d.isLifetime,
      createdAt: toIso(d.createdAt),
      redeemedBy: (d.redeemedBy as string | null) ?? null,
      redeemedByEmail: typeof d.redeemedBy === 'string' ? (emailByUid[d.redeemedBy] ?? d.redeemedBy) : null,
      redeemedAt: toIso(d.redeemedAt),
      revoked: !!d.revoked,
    })),
  });
}

async function handleRevoke(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) throw new HttpError(400, 'Missing coupon id');
  const ref = adminDb.collection('coupons').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Coupon not found');
  if (snap.data()?.redeemedBy) throw new HttpError(409, 'Already redeemed — revoking has no effect');
  await ref.update({ revoked: true });
  return NextResponse.json({ success: true });
}

async function handleGrant(body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) throw new HttpError(400, 'Missing email');

  let user;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch {
    throw new HttpError(404, `No account found for ${email}`);
  }

  if (body.remove === true) {
    await entitlementRef(user.uid).delete();
    return NextResponse.json({ success: true, email, uid: user.uid, removed: true });
  }

  const durationDays = body.durationDays === null ? null : Number(body.durationDays);
  if (!isValidDuration(durationDays)) throw new HttpError(400, 'Invalid duration');
  await applyGrant(
    user.uid,
    durationDays === null ? { lifetime: true } : { durationDays },
    'admin',
    'admin',
  );
  return NextResponse.json({ success: true, email, uid: user.uid });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (body.action) {
      case 'generate':
        return await handleGenerate(body);
      case 'list':
        return await handleList();
      case 'revoke':
        return await handleRevoke(body);
      case 'grant':
        return await handleGrant(body);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Premium Admin] error', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
