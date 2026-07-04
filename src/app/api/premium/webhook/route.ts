import { NextRequest, NextResponse } from 'next/server';
import { verifyStandardWebhook } from '@/lib/premium/webhook-verify';
import { grantPaymentOnce } from '@/lib/premium/server';
import { PLANS, isPlanId } from '@/lib/premium/plans';

export async function POST(req: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Premium Webhook] DODO_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const payload = await req.text();
  const id = req.headers.get('webhook-id') || '';
  const timestamp = req.headers.get('webhook-timestamp') || '';
  const signature = req.headers.get('webhook-signature') || '';

  if (!verifyStandardWebhook({ payload, id, timestamp, signature, secret })) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  // Only successful payments grant time; everything else is acknowledged and ignored.
  if (event?.type !== 'payment.succeeded') {
    return NextResponse.json({ received: true });
  }

  try {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const uid = metadata.uid;
    const plan = metadata.plan;
    if (typeof uid !== 'string' || !uid || !isPlanId(plan)) {
      // A payment we cannot attribute — log loudly, ack so Dodo stops retrying,
      // and reconcile manually via the admin grant tool if it ever happens.
      console.error('[Premium Webhook] payment.succeeded without usable metadata', {
        paymentId: data.payment_id,
        metadata,
      });
      return NextResponse.json({ received: true, ignored: 'missing metadata' });
    }

    const info = PLANS[plan];
    const eventKey = String(data.payment_id || id);
    const fresh = await grantPaymentOnce(
      eventKey,
      uid,
      info.durationDays === null ? { lifetime: true } : { durationDays: info.durationDays },
      plan,
      {
        uid,
        plan,
        amount: data.total_amount ?? null,
        currency: data.currency ?? null,
        paymentId: data.payment_id ?? null,
        webhookId: id,
        status: 'succeeded',
      },
    );
    return NextResponse.json({ received: true, ...(fresh ? {} : { duplicate: true }) });
  } catch (err) {
    // 500 makes Dodo retry; grantPaymentOnce is idempotent so retries are safe.
    console.error('[Premium Webhook] processing error', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
