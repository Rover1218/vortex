import { NextRequest, NextResponse } from 'next/server';
import { requireUser, HttpError } from '@/lib/premium/server';
import { PLANS, isPlanId } from '@/lib/premium/plans';

/**
 * Creates a Razorpay Order for the chosen plan. The client opens Razorpay
 * Checkout with the returned order id; the payment.captured webhook then
 * activates premium. Amounts are in paise.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const plan = body?.plan;
    if (!isPlanId(plan)) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      console.error('[Premium Checkout] Razorpay keys not configured');
      return NextResponse.json(
        { error: 'Payments are not configured yet. Use a redeem code instead.' },
        { status: 503 },
      );
    }

    const info = PLANS[plan];
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: info.inr * 100,
        currency: 'INR',
        receipt: `${plan}-${Date.now()}`,
        notes: { uid: user.uid, plan },
      }),
    });

    if (!res.ok) {
      console.error('[Premium Checkout] Razorpay error', res.status, await res.text());
      return NextResponse.json({ error: 'Payment provider error. Try again in a minute.' }, { status: 502 });
    }

    const order = await res.json();
    if (!order?.id) {
      console.error('[Premium Checkout] unexpected Razorpay response', order);
      return NextResponse.json({ error: 'Payment provider error. Try again in a minute.' }, { status: 502 });
    }

    return NextResponse.json({
      orderId: order.id,
      keyId,
      amount: info.inr * 100,
      currency: 'INR',
      planLabel: `Vortex Premium — ${info.label}`,
      email: user.email ?? '',
    });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Premium Checkout] error', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
