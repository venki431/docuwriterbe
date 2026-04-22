import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as billingService from '../services/billingService';
import {
  fetchTransactionForUser,
  invoiceFileName,
  listUserTransactions,
  renderInvoicePdf,
  resendInvoiceEmail as resendInvoiceEmailService,
} from '../services/invoiceService';
import { findUserById } from '../services/userService';
import { config } from '../config';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors';

const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const createOrderSchema = z.object({
  planId: z.enum(['monthly', 'quarterly', 'yearly']),
});

function formatINR(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { planId } = createOrderSchema.parse(req.body);
    const order = await billingService.createSubscriptionOrder(req.user.id, planId);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

export async function createVerificationOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const order = await billingService.createVerificationOrder(req.user.id);
    res.status(201).json({
      ...order,
      displayAmount: (order.amount / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = verifySchema.parse(req.body);
    const result = await billingService.verifyAndActivate({
      userId: req.user.id,
      ...input,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function listPlans(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const plans = config.subscription.plans.map((p) => {
      const months = p.durationDays / 30;
      const perMonthPaise = Math.round(p.pricePaise / Math.max(1, months));
      return {
        id: p.id,
        label: p.label,
        amountPaise: p.pricePaise,
        currency: config.subscription.currency,
        durationDays: p.durationDays,
        displayAmount: formatINR(p.pricePaise),
        pricePerMonthPaise: perMonthPaise,
        displayPricePerMonth: formatINR(perMonthPaise),
      };
    });

    // Savings vs monthly base.
    const monthly = plans.find((p) => p.id === 'monthly');
    const decorated = plans.map((p) => {
      if (!monthly || p.id === 'monthly') {
        return { ...p, savingsPercent: 0 };
      }
      const pct = Math.max(
        0,
        Math.round(
          (1 - p.pricePerMonthPaise / monthly.pricePerMonthPaise) * 100,
        ),
      );
      return { ...p, savingsPercent: pct };
    });

    res.json({ plans: decorated });
  } catch (err) {
    next(err);
  }
}

export async function listTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const rows = await listUserTransactions(req.user.id);
    res.json({
      transactions: rows.map((tx) => ({
        id: tx.id,
        status: tx.status,
        planId: tx.plan_id,
        durationDays: tx.duration_days,
        amountPaise: tx.amount_paise,
        currency: tx.currency,
        displayAmount: (tx.amount_paise / 100).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        razorpayOrderId: tx.razorpay_order_id,
        razorpayPaymentId: tx.razorpay_payment_id,
        invoiceNumber: tx.invoice_number,
        invoicedAt: tx.invoiced_at,
        createdAt: tx.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadInvoice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = req.params.id;
    if (!id) throw new BadRequestError('Missing transaction id');

    const tx = await fetchTransactionForUser(req.user.id, id);
    if (tx.status !== 'paid') {
      throw new BadRequestError(
        'Invoice is available only for successfully paid transactions',
      );
    }
    if (!tx.invoice_number) {
      // Defensive fallback — should not happen if payment flow ran correctly.
      throw new NotFoundError('Invoice not yet generated for this transaction');
    }

    const user = await findUserById(req.user.id);
    if (!user) throw new UnauthorizedError();

    const pdf = await renderInvoicePdf({
      tx,
      buyer: { name: user.name, email: user.email },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoiceFileName(tx)}"`,
    );
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

export async function resendInvoiceEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const id = req.params.id;
    if (!id) throw new BadRequestError('Missing transaction id');

    const result = await resendInvoiceEmailService({
      userId: req.user.id,
      transactionId: id,
    });
    res.json({
      success: true,
      deliveredTo: result.to,
      invoiceNumber: result.invoiceNumber,
    });
  } catch (err) {
    next(err);
  }
}

export async function webhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!(req.body instanceof Buffer)) {
      throw new BadRequestError('Webhook body must be raw');
    }
    const signature = req.header('x-razorpay-signature') ?? '';
    const result = await billingService.handleWebhookEvent({
      rawBody: req.body,
      signatureHeader: signature,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
