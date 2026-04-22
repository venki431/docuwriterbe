import { PoolClient } from 'pg';
import { config, findPlan } from '../config';
import { query } from '../db/pool';
import { escapeHtml } from '../utils/escape';
import { NotFoundError } from '../utils/errors';
import { renderHtmlToPdf } from './pdfService';
import {
  renderPaymentReceiptEmail,
  sendEmail,
  type PaymentReceiptKind,
} from './emailService';
import { findUserById } from './userService';

export interface InvoiceTransactionRow {
  id: string;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: string;
  plan_id: string | null;
  duration_days: number | null;
  invoice_number: string | null;
  invoiced_at: Date | null;
  receipt: string | null;
  created_at: Date;
  updated_at: Date;
}

interface BuyerInfo {
  name: string;
  email: string;
}

/**
 * Assigns an invoice number + invoiced_at to the given transaction row, if
 * one isn't already set. Intended to be called from within the same DB
 * transaction that marks the row as paid — the sequence guarantees
 * monotonicity and the `where invoice_number is null` clause protects
 * against double-assignment.
 */
export async function assignInvoiceNumber(
  client: Pick<PoolClient, 'query'>,
  transactionId: string,
  prefix: string = config.seller.invoicePrefix,
): Promise<string | null> {
  const { rows } = await client.query<{ invoice_number: string }>(
    `update transactions
     set invoice_number = $1 || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'),
         invoiced_at = now()
     where id = $2 and invoice_number is null
     returning invoice_number`,
    [prefix, transactionId],
  );
  return rows[0]?.invoice_number ?? null;
}

function formatINR(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function planLabel(planId: string | null, durationDays: number | null): string {
  const label = planId ? planId[0].toUpperCase() + planId.slice(1) : 'Subscription';
  if (!durationDays) return `DocuWriter ${label} Plan`;
  return `DocuWriter ${label} Plan — ${durationDays} days of access`;
}

function renderInvoiceHtml(
  tx: InvoiceTransactionRow,
  buyer: BuyerInfo,
): string {
  const seller = config.seller;
  const isTaxInvoice = !!seller.gstin;
  const docTitle = isTaxInvoice ? 'Tax Invoice' : 'Bill of Supply';
  const issuedAt = tx.invoiced_at ?? tx.updated_at;
  const e = escapeHtml;

  const sellerAddressBlock = [
    seller.addressLine1,
    seller.addressLine2,
    seller.pincode ? `PIN ${seller.pincode}` : '',
  ]
    .filter(Boolean)
    .map((l) => `<div>${e(l)}</div>`)
    .join('');

  const sellerMetaBlock = [
    seller.website ? `<div>${e(seller.website)}</div>` : '',
    seller.email ? `<div>${e(seller.email)}</div>` : '',
    seller.phone ? `<div>${e(seller.phone)}</div>` : '',
    seller.pan ? `<div>PAN: ${e(seller.pan)}</div>` : '',
    seller.gstin ? `<div>GSTIN: ${e(seller.gstin)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const lineAmount = formatINR(tx.amount_paise);
  const currency = tx.currency || 'INR';
  const symbol = currency === 'INR' ? '₹' : currency + ' ';

  const complianceFooter = isTaxInvoice
    ? `<p>Amounts shown include GST as applicable. This is a computer-generated tax invoice and does not require a physical signature.</p>`
    : `<p><strong>Bill of Supply.</strong> ${e(seller.legalName)} is not currently registered under the Goods and Services Tax Act, 2017. No GST has been charged on this invoice.</p>
       <p>This is a computer-generated document and does not require a physical signature.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${e(docTitle)} ${e(tx.invoice_number ?? '')}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      font-size: 11pt;
      line-height: 1.5;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .brand {
      font-size: 20pt;
      font-weight: 700;
      color: #294fd4;
      margin: 0 0 6px;
      letter-spacing: -0.5px;
    }
    .seller-meta { font-size: 10pt; color: #475569; }
    .seller-meta div { margin-bottom: 2px; }
    .doc-title {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      text-align: right;
      margin: 0 0 8px;
      letter-spacing: 1px;
    }
    .invoice-meta { text-align: right; font-size: 10pt; color: #475569; }
    .invoice-meta .label { color: #64748b; }
    .invoice-meta .value { color: #0f172a; font-weight: 600; }
    .invoice-meta table { border-collapse: collapse; margin-left: auto; }
    .invoice-meta td { padding: 2px 0; }
    .invoice-meta td:first-child { padding-right: 16px; }

    .parties {
      display: flex;
      gap: 24px;
      margin: 28px 0;
    }
    .party {
      flex: 1;
      background: #f8fafc;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .party h3 {
      font-size: 9pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 6px;
    }
    .party .party-name { font-weight: 700; font-size: 11.5pt; }
    .party div { margin-bottom: 2px; }

    table.line-items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    table.line-items th {
      text-align: left;
      font-size: 9pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
    }
    table.line-items th.num, table.line-items td.num { text-align: right; }
    table.line-items td {
      padding: 14px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .totals {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
    }
    .totals table {
      border-collapse: collapse;
      min-width: 260px;
    }
    .totals td { padding: 6px 0; }
    .totals td.label { color: #64748b; padding-right: 24px; }
    .totals td.value { text-align: right; font-weight: 500; }
    .totals tr.grand-total td {
      border-top: 2px solid #0f172a;
      padding-top: 10px;
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
    }

    .payment-meta {
      margin-top: 28px;
      padding: 12px 14px;
      background: #ecfdf5;
      border-left: 3px solid #10b981;
      border-radius: 4px;
      font-size: 10pt;
      color: #065f46;
    }
    .payment-meta .status { font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }

    .footer {
      margin-top: 32px;
      padding-top: 18px;
      border-top: 1px dashed #cbd5e1;
      font-size: 9.5pt;
      color: #475569;
    }
    .footer p { margin: 0 0 6px; }
    .footer a { color: #294fd4; text-decoration: none; }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <p class="brand">${e(seller.legalName)}</p>
      <div class="seller-meta">
        ${sellerAddressBlock}
        ${sellerMetaBlock}
      </div>
    </div>
    <div>
      <p class="doc-title">${e(docTitle).toUpperCase()}</p>
      <div class="invoice-meta">
        <table>
          <tr>
            <td class="label">Invoice #</td>
            <td class="value">${e(tx.invoice_number ?? '—')}</td>
          </tr>
          <tr>
            <td class="label">Issue date</td>
            <td class="value">${e(formatDate(issuedAt))}</td>
          </tr>
          <tr>
            <td class="label">Receipt</td>
            <td class="value">${e(tx.receipt ?? '—')}</td>
          </tr>
        </table>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Billed From</h3>
      <div class="party-name">${e(seller.legalName)}</div>
      <div>${e(seller.city)}${seller.state ? `, ${e(seller.state)}` : ''}</div>
      <div>${e(seller.country)}</div>
      ${seller.email ? `<div>${e(seller.email)}</div>` : ''}
    </div>
    <div class="party">
      <h3>Billed To</h3>
      <div class="party-name">${e(buyer.name)}</div>
      <div>${e(buyer.email)}</div>
    </div>
  </div>

  <table class="line-items">
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Duration</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${e(planLabel(tx.plan_id, tx.duration_days))}</td>
        <td class="num">${tx.duration_days ? `${tx.duration_days} days` : '—'}</td>
        <td class="num">${e(symbol)}${e(lineAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td class="label">Subtotal</td>
        <td class="value">${e(symbol)}${e(lineAmount)}</td>
      </tr>
      <tr>
        <td class="label">Tax</td>
        <td class="value">${isTaxInvoice ? 'See breakdown above' : 'Not applicable'}</td>
      </tr>
      <tr class="grand-total">
        <td class="label">Total Paid</td>
        <td class="value">${e(symbol)}${e(lineAmount)}</td>
      </tr>
    </table>
  </div>

  <div class="payment-meta">
    <div><span class="status">Paid</span> · via Razorpay</div>
    <div>Order ID: ${e(tx.razorpay_order_id)}</div>
    ${tx.razorpay_payment_id ? `<div>Payment ID: ${e(tx.razorpay_payment_id)}</div>` : ''}
  </div>

  <div class="footer">
    ${complianceFooter}
    <p>Questions? Write to <a href="mailto:${e(seller.email)}">${e(seller.email)}</a>.</p>
  </div>

</body>
</html>`;
}

export async function fetchTransactionForUser(
  userId: string,
  transactionId: string,
): Promise<InvoiceTransactionRow> {
  const { rows } = await query<InvoiceTransactionRow>(
    `select id, user_id, razorpay_order_id, razorpay_payment_id,
            amount_paise, currency, status, plan_id, duration_days,
            invoice_number, invoiced_at, receipt, created_at, updated_at
     from transactions
     where id = $1 and user_id = $2 limit 1`,
    [transactionId, userId],
  );
  const tx = rows[0];
  if (!tx) throw new NotFoundError('Invoice not found');
  return tx;
}

export async function listUserTransactions(
  userId: string,
): Promise<InvoiceTransactionRow[]> {
  const { rows } = await query<InvoiceTransactionRow>(
    `select id, user_id, razorpay_order_id, razorpay_payment_id,
            amount_paise, currency, status, plan_id, duration_days,
            invoice_number, invoiced_at, receipt, created_at, updated_at
     from transactions
     where user_id = $1
     order by created_at desc
     limit 200`,
    [userId],
  );
  return rows;
}

export async function renderInvoicePdf(params: {
  tx: InvoiceTransactionRow;
  buyer: BuyerInfo;
}): Promise<Buffer> {
  const html = renderInvoiceHtml(params.tx, params.buyer);
  return renderHtmlToPdf(html);
}

export function invoiceFileName(tx: InvoiceTransactionRow): string {
  const base = tx.invoice_number || `receipt-${tx.id.slice(0, 8)}`;
  return `${base}.pdf`;
}

function formatAccessUntilLabel(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Renders the PDF and sends the receipt email. Throws on any failure —
 * callers are responsible for the idempotency guard around it.
 */
async function buildAndSendInvoiceEmail(params: {
  userId: string;
  transactionId: string;
  kind: PaymentReceiptKind;
}): Promise<void> {
  const tx = await fetchTransactionForUser(params.userId, params.transactionId);
  const user = await findUserById(params.userId);
  if (!user) throw new NotFoundError('User not found');

  const pdf = await renderInvoicePdf({
    tx,
    buyer: { name: user.name, email: user.email },
  });

  const amount = (tx.amount_paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currencySymbol = (tx.currency || 'INR') === 'INR' ? '₹' : `${tx.currency} `;

  const planLabelStr = params.kind === 'verification'
    ? 'Account verification'
    : `${findPlan(tx.plan_id ?? '')?.label ?? 'Subscription'} plan`;

  const durationLabel = tx.duration_days
    ? `${tx.duration_days} days`
    : params.kind === 'verification'
      ? 'One-time charge'
      : '';

  const accountUrl = `${config.clientOrigin.replace(/\/+$/, '')}/account`;

  const accessUntilLabel =
    params.kind === 'subscription'
      ? formatAccessUntilLabel(user.subscription_active_until)
      : '';

  const { subject, html, text } = renderPaymentReceiptEmail({
    name: user.name,
    kind: params.kind,
    planLabel: planLabelStr,
    durationLabel,
    amountFormatted: `${currencySymbol}${amount}`,
    invoiceNumber: tx.invoice_number ?? 'pending',
    paidAt: tx.invoiced_at ?? tx.updated_at,
    accessUntilLabel,
    accountUrl,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
    attachments: [{ filename: invoiceFileName(tx), content: pdf }],
  });
}

function inferReceiptKind(planId: string | null): PaymentReceiptKind {
  return planId === 'verification' ? 'verification' : 'subscription';
}

/**
 * Emails the invoice PDF to the buyer — exactly once per transaction.
 *
 * The atomic `invoice_email_sent_at is null` guard lets us safely call this
 * from both the client-verify path and the Razorpay webhook without risking
 * a double-send. The claim is released (reset to null) on failure so a
 * later retry can succeed. Errors are logged but not thrown — the caller
 * (billing activation) should not fail if the email fails.
 */
export async function deliverInvoiceEmail(params: {
  userId: string;
  transactionId: string;
  kind: PaymentReceiptKind;
}): Promise<void> {
  // Atomic "claim" — if another path already claimed this transaction's
  // email slot, bail out without doing work.
  const { rows: claimRows } = await query<{ id: string }>(
    `update transactions
     set invoice_email_sent_at = now()
     where id = $1
       and user_id = $2
       and status = 'paid'
       and invoice_email_sent_at is null
     returning id`,
    [params.transactionId, params.userId],
  );
  if (!claimRows[0]) return;

  try {
    await buildAndSendInvoiceEmail(params);
  } catch (err) {
    console.error('[invoice-email] delivery failed — releasing claim:', err);
    await query(
      `update transactions set invoice_email_sent_at = null where id = $1`,
      [params.transactionId],
    );
  }
}

/**
 * Force a resend — used by the user-facing "email me this invoice again"
 * endpoint. Unlike `deliverInvoiceEmail`, this always attempts the send
 * regardless of whether the email was previously delivered, and propagates
 * errors so the HTTP caller can see exactly what failed.
 */
export async function resendInvoiceEmail(params: {
  userId: string;
  transactionId: string;
}): Promise<{ to: string; invoiceNumber: string | null }> {
  const tx = await fetchTransactionForUser(params.userId, params.transactionId);
  const user = await findUserById(params.userId);
  if (!user) throw new NotFoundError('User not found');
  if (tx.status !== 'paid') {
    throw new Error('Invoice email can only be resent for paid transactions');
  }

  await buildAndSendInvoiceEmail({
    userId: params.userId,
    transactionId: params.transactionId,
    kind: inferReceiptKind(tx.plan_id),
  });

  // Record the (re)send time — overwrites the previous timestamp so the
  // admin dashboard reflects the most recent delivery.
  await query(
    `update transactions set invoice_email_sent_at = now() where id = $1`,
    [params.transactionId],
  );

  return { to: user.email, invoiceNumber: tx.invoice_number };
}
