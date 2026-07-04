import { NextRequest, NextResponse } from 'next/server';
import { requireUser, checkRedeemRateLimit, redeemCoupon, HttpError } from '@/lib/premium/server';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) return NextResponse.json({ error: 'Enter a code' }, { status: 400 });

    await checkRedeemRateLimit(user.uid);
    const result = await redeemCoupon(user.uid, code);
    return NextResponse.json({ success: true, durationDays: result.durationDays });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Premium Redeem] error', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
