import { NextRequest, NextResponse } from 'next/server';
import { requireUser, HttpError } from '@/lib/premium/server';
import { isPlanId, type PlanId } from '@/lib/premium/plans';

const PRODUCT_ENV: Record<PlanId, string> = {
  monthly: 'DODO_PRODUCT_MONTHLY',
  halfyear: 'DODO_PRODUCT_HALFYEAR',
  lifetime: 'DODO_PRODUCT_LIFETIME',
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const plan = body?.plan;
    if (!isPlanId(plan)) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });

    const apiKey = process.env.DODO_API_KEY;
    const apiBase = process.env.DODO_API_BASE || 'https://test.dodopayments.com';
    const productId = process.env[PRODUCT_ENV[plan]];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!apiKey || !productId || !appUrl) {
      console.error('[Premium Checkout] missing configuration', {
        hasApiKey: !!apiKey,
        hasProductId: !!productId,
        hasAppUrl: !!appUrl,
      });
      return NextResponse.json(
        { error: 'Payments are not configured yet. Use a redeem code instead.' },
        { status: 503 },
      );
    }

    const res = await fetch(`${apiBase}/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        ...(user.email ? { customer: { email: user.email } } : {}),
        metadata: { uid: user.uid, plan },
        return_url: `${appUrl}/upgrade?status=success`,
      }),
    });

    if (!res.ok) {
      console.error('[Premium Checkout] Dodo error', res.status, await res.text());
      return NextResponse.json({ error: 'Payment provider error. Try again in a minute.' }, { status: 502 });
    }

    const session = await res.json();
    if (!session?.checkout_url) {
      console.error('[Premium Checkout] unexpected Dodo response', session);
      return NextResponse.json({ error: 'Payment provider error. Try again in a minute.' }, { status: 502 });
    }
    return NextResponse.json({ checkout_url: session.checkout_url });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Premium Checkout] error', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
