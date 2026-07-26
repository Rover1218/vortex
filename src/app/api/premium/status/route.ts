import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { isPremiumActive } from '@/lib/premium/entitlement';

/**
 * Premium status for the local engine. The engine already holds the user's
 * Firebase ID token (it syncs settings via /api/sync); it posts that token
 * here and gets back whether the account is premium, so it can enforce the
 * free-tier speed cap itself — even after a plan expires and regardless of
 * whether the web dashboard is ever opened.
 *
 * Accepts the token in the JSON body ({ token }) to match /api/sync, or as a
 * Bearer header.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const token = typeof body?.token === 'string' && body.token ? body.token : bearer;
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    let uid: string;
    try {
      uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const snap = await adminDb.collection('users').doc(uid).collection('config').doc('entitlement').get();
    const data = snap.data();
    const core = data
      ? {
          isLifetime: !!data.isLifetime,
          premiumUntilMs: data.premiumUntil instanceof Timestamp ? data.premiumUntil.toMillis() : null,
        }
      : null;

    return NextResponse.json({
      isPremium: isPremiumActive(core, Date.now()),
      isLifetime: !!core?.isLifetime,
      premiumUntil: core?.premiumUntilMs ?? null,
    });
  } catch (err) {
    console.error('[Premium Status] error', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
