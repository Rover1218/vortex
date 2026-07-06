import { NextRequest, NextResponse } from 'next/server';
import { verifyRazorpayWebhook } from '@/lib/premium/razorpay-verify';
import { grantPaymentOnce } from '@/lib/premium/server';
import { PLANS, isPlanId } from '@/lib/premium/plans';

/**
 * Razorpay webhook. Subscribe this endpoint to `payment.captured` in the
 * Razorpay dashboard. Signature = HMAC-SHA256(raw body, webhook secret) in
 * the x-razorpay-signature header. Granting is idempotent per payment id,
 * so Razorpay's retries can never double-credit.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Premium Webhook] RAZORPAY_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const payload = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  if (!verifyRazorpayWebhook({ payload, signature, secret })) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  // Only captured payments grant time; acknowledge everything else.
  if (event?.event !== 'payment.captured') {
    return NextResponse.json({ received: true });
  }

  try {
    const entity = (event.payload?.payment?.entity ?? {}) as Record<string, unknown>;
    const notes = (entity.notes ?? {}) as Record<string, unknown>;
    const uid = notes.uid;
    const plan = notes.plan;
    if (typeof uid !== 'string' || !uid || !isPlanId(plan)) {
      // A payment we cannot attribute — log loudly, ack so Razorpay stops
      // retrying, and reconcile manually via the admin grant tool if needed.
      console.error('[Premium Webhook] payment.captured without usable notes', {
        paymentId: entity.id,
        notes,
      });
      return NextResponse.json({ received: true, ignored: 'missing notes' });
    }

    const info = PLANS[plan];
    const eventKey = String(entity.id || `order-${entity.order_id}`);
    const result = await grantPaymentOnce(
      eventKey,
      uid,
      info.durationDays === null ? { lifetime: true } : { durationDays: info.durationDays },
      plan,
      {
        uid,
        plan,
        amount: entity.amount ?? null,
        currency: entity.currency ?? null,
        paymentId: entity.id ?? null,
        orderId: entity.order_id ?? null,
        provider: 'razorpay',
        status: 'captured',
      },
    );
    if (!result.credited) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true, ...(result.bonusDays ? { first_purchase_bonus_days: result.bonusDays } : {}) });
  } catch (err) {
    // 500 makes Razorpay retry; grantPaymentOnce is idempotent so retries are safe.
    console.error('[Premium Webhook] processing error', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
