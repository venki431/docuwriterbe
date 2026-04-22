import crypto from 'crypto';
import { config, findPlan } from '../config';
import { query, withTransaction } from '../db/pool';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';
import { getRazorpay } from './razorpayClient';
import { assignInvoiceNumber, deliverInvoiceEmail } from './invoiceService';

/**
 * Fire-and-forget wrapper around deliverInvoiceEmail — used by all billing
 * activation paths. We intentionally do NOT await the send so the HTTP
 * response (or webhook ack) returns immediately while PDF rendering +
 * Resend delivery happens in the background. Errors are logged; the
 * helper itself is idempotent so a later retry is safe.
 */
function kickoffInvoiceEmail(
  userId: string,
  transactionId: string,
  kind: 'subscription' | 'verification',
) {
  void deliverInvoiceEmail({ userId, transactionId, kind }).catch((err) => {
    console.error('[billing] kickoffInvoiceEmail failed:', err);
  });
}

const VERIFICATION_PLAN_ID = 'verification';

interface TransactionRow {
  id: string;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  plan_id: string | null;
  duration_days: number | null;
  receipt: string | null;
  created_at: Date;
}

export async function createVerificationOrder(userId: string): Promise<{
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  receipt: string;
  planId: string;
}> {
  // Guard: don't charge again if the user is already verified.
  const { rows } = await query<{ verified_at: Date | null }>(
    `select verified_at from users where id = $1`,
    [userId],
  );
  if (!rows[0]) throw new NotFoundError('User not found');
  if (rows[0].verified_at) {
    throw new ConflictError('Your account is already verified');
  }

  const amount = config.verification.pricePaise;
  const currency = config.verification.currency;
  const receipt = `verify_${userId.slice(0, 8)}_${Date.now().toString(36)}`;

  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount,
    currency,
    receipt,
    notes: {
      userId,
      planId: VERIFICATION_PLAN_ID,
      durationDays: '0',
      kind: 'verification',
    },
  });

  await query(
    `insert into transactions
       (user_id, razorpay_order_id, amount_paise, currency, status,
        plan_id, duration_days, receipt, notes)
     values ($1, $2, $3, $4, 'created', $5, 0, $6, $7::jsonb)`,
    [
      userId,
      order.id,
      amount,
      currency,
      VERIFICATION_PLAN_ID,
      receipt,
      JSON.stringify({ kind: 'verification' }),
    ],
  );

  return {
    orderId: order.id,
    amount,
    currency,
    keyId: config.razorpay.keyId,
    receipt,
    planId: VERIFICATION_PLAN_ID,
  };
}

export async function createSubscriptionOrder(
  userId: string,
  planId: string,
): Promise<{
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  receipt: string;
  planId: string;
  durationDays: number;
}> {
  const plan = findPlan(planId);
  if (!plan) throw new BadRequestError(`Unknown plan: ${planId}`);

  const amount = plan.pricePaise;
  const currency = config.subscription.currency;
  const receipt = `docu_${userId.slice(0, 8)}_${Date.now().toString(36)}`;

  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount,
    currency,
    receipt,
    notes: { userId, planId: plan.id, durationDays: String(plan.durationDays) },
  });

  await query(
    `insert into transactions
       (user_id, razorpay_order_id, amount_paise, currency, status,
        plan_id, duration_days, receipt, notes)
     values ($1, $2, $3, $4, 'created', $5, $6, $7, $8::jsonb)`,
    [
      userId,
      order.id,
      amount,
      currency,
      plan.id,
      plan.durationDays,
      receipt,
      JSON.stringify({ planId: plan.id, label: plan.label }),
    ],
  );

  return {
    orderId: order.id,
    amount,
    currency,
    keyId: config.razorpay.keyId,
    receipt,
    planId: plan.id,
    durationDays: plan.durationDays,
  };
}

function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(params.signature),
  );
}

export async function verifyAndActivate(params: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{
  subscriptionActiveUntil: string | null;
  planId: string;
  verifiedAt: string | null;
  kind: 'verification' | 'subscription';
}> {
  const { rows } = await query<TransactionRow>(
    `select * from transactions where razorpay_order_id = $1 and user_id = $2 limit 1`,
    [params.razorpayOrderId, params.userId],
  );
  const tx = rows[0];
  if (!tx) throw new NotFoundError('Order not found');

  const planId = tx.plan_id ?? 'monthly';
  const isVerification = planId === VERIFICATION_PLAN_ID;

  // Idempotent replay — if the tx was already marked paid, return current state.
  if (tx.status === 'paid') {
    const { rows: userRows } = await query<{
      subscription_active_until: Date | null;
      verified_at: Date | null;
    }>(
      `select subscription_active_until, verified_at from users where id = $1`,
      [params.userId],
    );
    const u = userRows[0];
    // Nudge the email again — no-op if it was already sent.
    kickoffInvoiceEmail(
      params.userId,
      tx.id,
      isVerification ? 'verification' : 'subscription',
    );
    return {
      subscriptionActiveUntil: u?.subscription_active_until?.toISOString() ?? null,
      verifiedAt: u?.verified_at?.toISOString() ?? null,
      planId,
      kind: isVerification ? 'verification' : 'subscription',
    };
  }

  const ok = verifyPaymentSignature({
    orderId: params.razorpayOrderId,
    paymentId: params.razorpayPaymentId,
    signature: params.razorpaySignature,
  });
  if (!ok) throw new BadRequestError('Invalid payment signature');

  // ---- Verification path: mark the user verified, no subscription extension.
  if (isVerification) {
    const result = await withTransaction(async (client) => {
      const { rows: txRows } = await client.query<{ id: string }>(
        `update transactions
         set razorpay_payment_id = $1,
             razorpay_signature  = $2,
             status              = 'paid'
         where razorpay_order_id = $3
         returning id`,
        [
          params.razorpayPaymentId,
          params.razorpaySignature,
          params.razorpayOrderId,
        ],
      );
      if (txRows[0]) await assignInvoiceNumber(client, txRows[0].id);

      const { rows: updated } = await client.query<{
        verified_at: Date;
        subscription_active_until: Date | null;
      }>(
        `update users
         set verified_at = coalesce(verified_at, now())
         where id = $1
         returning verified_at, subscription_active_until`,
        [params.userId],
      );
      return updated[0];
    });

    kickoffInvoiceEmail(params.userId, tx.id, 'verification');

    return {
      verifiedAt: result.verified_at.toISOString(),
      subscriptionActiveUntil:
        result.subscription_active_until?.toISOString() ?? null,
      planId,
      kind: 'verification',
    };
  }

  // ---- Subscription path: extend access by the plan's duration.
  const durationDays =
    tx.duration_days ?? findPlan(planId)?.durationDays ?? 30;

  const user = await withTransaction(async (client) => {
    const { rows: txRows } = await client.query<{ id: string }>(
      `update transactions
       set razorpay_payment_id = $1,
           razorpay_signature  = $2,
           status              = 'paid'
       where razorpay_order_id = $3
       returning id`,
      [
        params.razorpayPaymentId,
        params.razorpaySignature,
        params.razorpayOrderId,
      ],
    );
    if (txRows[0]) await assignInvoiceNumber(client, txRows[0].id);

    const { rows: updated } = await client.query<{
      subscription_active_until: Date;
    }>(
      `update users
       set subscription_active_until =
         greatest(coalesce(subscription_active_until, now()), now())
         + ($2 || ' days')::interval
       where id = $1
       returning subscription_active_until`,
      [params.userId, String(durationDays)],
    );
    return updated[0];
  });

  kickoffInvoiceEmail(params.userId, tx.id, 'subscription');

  return {
    subscriptionActiveUntil: user.subscription_active_until.toISOString(),
    verifiedAt: null,
    planId,
    kind: 'subscription',
  };
}

// Razorpay async webhook. Only acts if the event links back to a known tx.
export async function handleWebhookEvent(params: {
  rawBody: Buffer;
  signatureHeader: string;
}): Promise<{ handled: boolean; type: string }> {
  if (!config.razorpay.webhookSecret) {
    throw new BadRequestError('Razorpay webhook secret not configured');
  }
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(params.rawBody)
    .digest('hex');
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(params.signatureHeader || ''),
    )
  ) {
    throw new BadRequestError('Invalid webhook signature');
  }

  type RazorpayWebhookEvent = {
    event: string;
    id?: string;
    payload: {
      payment?: {
        entity: {
          id: string;
          order_id: string;
          status: string;
          amount: number;
          currency: string;
          notes?: Record<string, string>;
        };
      };
    };
  };
  const body = JSON.parse(
    params.rawBody.toString('utf8'),
  ) as RazorpayWebhookEvent;

  // Idempotency — insert event row; skip if seen.
  if (body.id) {
    const { rows } = await query<{ id: string }>(
      `insert into billing_events (razorpay_event_id, event_type, payload)
       values ($1, $2, $3::jsonb)
       on conflict (razorpay_event_id) do nothing
       returning id`,
      [body.id, body.event, JSON.stringify(body)],
    );
    if (rows.length === 0) return { handled: false, type: body.event };
  } else {
    await query(
      `insert into billing_events (event_type, payload)
       values ($1, $2::jsonb)`,
      [body.event, JSON.stringify(body)],
    );
  }

  if (body.event === 'payment.captured' && body.payload.payment) {
    const payment = body.payload.payment.entity;
    const userId = payment.notes?.userId;
    if (!userId) return { handled: false, type: body.event };

    const activated = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: string;
        status: string;
        plan_id: string | null;
        duration_days: number | null;
      }>(
        `select id, status, plan_id, duration_days
         from transactions where razorpay_order_id = $1 for update`,
        [payment.order_id],
      );
      const row = rows[0];
      if (!row || row.status === 'paid') return null; // already activated via /verify or missing tx

      await client.query(
        `update transactions set razorpay_payment_id = $1, status = 'paid'
         where razorpay_order_id = $2`,
        [payment.id, payment.order_id],
      );
      await assignInvoiceNumber(client, row.id);

      const isVerification = row.plan_id === VERIFICATION_PLAN_ID;
      if (isVerification) {
        await client.query(
          `update users set verified_at = coalesce(verified_at, now()) where id = $1`,
          [userId],
        );
      } else {
        const durationDays =
          row.duration_days ??
          findPlan(row.plan_id ?? 'monthly')?.durationDays ??
          30;
        await client.query(
          `update users
           set subscription_active_until =
             greatest(coalesce(subscription_active_until, now()), now())
             + ($2 || ' days')::interval
           where id = $1`,
          [userId, String(durationDays)],
        );
      }

      return {
        transactionId: row.id,
        kind: isVerification ? ('verification' as const) : ('subscription' as const),
      };
    });

    if (activated) {
      kickoffInvoiceEmail(userId, activated.transactionId, activated.kind);
    }
  } else if (body.event === 'payment.failed' && body.payload.payment) {
    const payment = body.payload.payment.entity;
    await query(
      `update transactions set status = 'failed', razorpay_payment_id = $1
       where razorpay_order_id = $2 and status <> 'paid'`,
      [payment.id, payment.order_id],
    );
  }

  await query(
    `update billing_events set processed_at = now() where razorpay_event_id = $1`,
    [body.id ?? null],
  );

  return { handled: true, type: body.event };
}
