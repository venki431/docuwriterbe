import { Resend } from 'resend';
import { config } from '../config';

let client: Resend | null = null;

function resend(): Resend | null {
  if (!config.email.resendApiKey) return null;
  if (!client) client = new Resend(config.email.resendApiKey);
  return client;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

/**
 * Sends a transactional email via Resend.
 *
 * When RESEND_API_KEY is not set (local dev), we log the message body to
 * the server console so engineers can still follow reset links without a
 * real inbox. This is intentional — we do not silently drop emails in
 * production because `assertProductionSecrets` can be extended to require
 * the key when deployed.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const r = resend();
  if (!r) {
    // Dev fallback — the full body is visible in terminal logs.
    const attachNote = payload.attachments?.length
      ? `\n  Attachments: ${payload.attachments
          .map((a) => `${a.filename} (${a.content.length} bytes)`)
          .join(', ')}`
      : '';
    console.warn(
      '[email] RESEND_API_KEY is empty. Printing email to console instead:\n' +
        `  To: ${payload.to}\n` +
        `  From: ${config.email.from}\n` +
        `  Subject: ${payload.subject}${attachNote}\n` +
        `  --- text body ---\n${payload.text}\n` +
        `  -----------------`,
    );
    return;
  }

  const { error } = await r.emails.send({
    from: config.email.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  if (error) {
    console.error('[email] Resend send failed:', error);
    throw new Error('Failed to send email');
  }
}

// ─── templates ─────────────────────────────────────────────────────────────

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIstDateTime(d: Date): string {
  // e.g. "22 Apr 2026, 02:15 PM IST"
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  return `${d.toLocaleString('en-IN', options)} IST`;
}

/**
 * Summarises a raw User-Agent string down to "Chrome on macOS" style so a
 * non-technical user can quickly tell whether the request looks like them.
 * Falls back to "Unknown device" on anything unrecognisable.
 */
function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const s = ua.toLowerCase();
  const browser = s.includes('edg/')
    ? 'Edge'
    : s.includes('chrome/') && !s.includes('chromium/')
      ? 'Chrome'
      : s.includes('firefox/')
        ? 'Firefox'
        : s.includes('safari/') && !s.includes('chrome/')
          ? 'Safari'
          : 'Browser';
  const os = s.includes('iphone') || s.includes('ios')
    ? 'iPhone'
    : s.includes('ipad')
      ? 'iPad'
      : s.includes('android')
        ? 'Android'
        : s.includes('mac os') || s.includes('macintosh')
          ? 'macOS'
          : s.includes('windows')
            ? 'Windows'
            : s.includes('linux')
              ? 'Linux'
              : 'device';
  return `${browser} on ${os}`;
}

export interface PasswordResetEmailParams {
  name: string;
  resetUrl: string;
  ttlMinutes: number;
  /** When the reset was requested, for the "Request details" block. */
  requestedAt: Date;
  /** Best-effort IP. Shown to the user so they can spot forged requests. */
  requesterIp: string | null;
  /** Raw user-agent header — summarised before display. */
  requesterUserAgent: string | null;
}

export function renderPasswordResetEmail(
  params: PasswordResetEmailParams,
): { subject: string; html: string; text: string } {
  const {
    name,
    resetUrl,
    ttlMinutes,
    requestedAt,
    requesterIp,
    requesterUserAgent,
  } = params;

  const firstName = (name.split(' ')[0] || 'there').trim();
  const supportEmail = config.seller.email;
  const productOrigin = config.clientOrigin.replace(/\/+$/, '');
  const subject = 'Reset your DocGen password';
  const deviceLabel = describeUserAgent(requesterUserAgent);
  const ipLabel = requesterIp || 'Unknown';
  const timeLabel = formatIstDateTime(requestedAt);

  // ─── plain text (for email clients that prefer it / spam score) ────────
  const text = [
    `Hi ${firstName},`,
    '',
    `Someone (hopefully you) asked to reset the password on your DocGen account.`,
    `If it was you, open the link below within ${ttlMinutes} minutes to set a new password:`,
    '',
    resetUrl,
    '',
    `— Request details —`,
    `Time: ${timeLabel}`,
    `IP address: ${ipLabel}`,
    `Device: ${deviceLabel}`,
    '',
    `Didn't ask for this?`,
    `You can ignore this email — your password hasn't changed. If you see`,
    `repeated requests you didn't make, please email ${supportEmail}.`,
    '',
    `— The DocGen team`,
    `${productOrigin}`,
  ].join('\n');

  // ─── HTML (table-based for Outlook / Apple Mail / Gmail parity) ────────
  const safeResetUrl = escapeHtml(resetUrl);
  const safeName = escapeHtml(firstName);
  const safeIp = escapeHtml(ipLabel);
  const safeDevice = escapeHtml(deviceLabel);
  const safeTime = escapeHtml(timeLabel);
  const safeSupport = escapeHtml(supportEmail);
  const safeOrigin = escapeHtml(productOrigin);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(subject)}</title>
  <style>
    /* Gmail + Apple Mail honour these. Outlook ignores them and falls back
       to the inline styles below. */
    @media (prefers-color-scheme: dark) {
      .card { background:#0f172a !important; color:#e2e8f0 !important; border-color:#1e293b !important; }
      .card-soft { background:#1e293b !important; border-color:#334155 !important; }
      .text-muted { color:#94a3b8 !important; }
      .text-strong { color:#f8fafc !important; }
      .shell { background:#020617 !important; }
      .footer-link { color:#93c5fd !important; }
    }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; padding:16px !important; }
      .card { padding:24px !important; }
      .meta-grid td { display:block !important; width:100% !important; padding:4px 0 !important; }
    }
  </style>
</head>
<body class="shell" style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <!-- Hidden preheader (shown in inbox preview) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    Set a new password for your DocGen account — this link expires in ${ttlMinutes} minutes.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <!-- Brand header -->
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:40px;vertical-align:middle;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#3a6bf0 0%,#1c357f 100%);color:#ffffff;font-weight:700;font-size:18px;text-align:center;line-height:40px;">D</div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;" class="text-strong">
                    <span style="font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">DocGen</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td class="card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">

              <!-- Icon badge -->
              <div style="width:52px;height:52px;border-radius:14px;background:#eef5ff;display:inline-block;text-align:center;line-height:52px;margin-bottom:20px;">
                <span style="font-size:26px;">🔐</span>
              </div>

              <h1 class="text-strong" style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#0f172a;font-weight:700;letter-spacing:-0.02em;">
                Reset your password
              </h1>

              <p class="text-muted" style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#475569;">
                Hi ${safeName},
              </p>
              <p class="text-muted" style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#475569;">
                Someone (hopefully you) asked to reset the password on your
                DocGen account. If it was you, tap the button below to
                set a new one.
              </p>

              <!-- CTA button (bulletproof for Outlook) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="border-radius:10px;background:#294fd4;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeResetUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="21%" stroke="f" fillcolor="#294fd4">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;">Set a new password</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${safeResetUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;background:#294fd4;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                      Set a new password
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p class="text-muted" style="margin:0 0 6px;font-size:13px;color:#64748b;line-height:1.5;">
                This link expires in <strong style="color:#0f172a;">${ttlMinutes} minutes</strong>. If the button doesn't work, copy this URL into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="${safeResetUrl}" style="color:#294fd4;text-decoration:none;">${safeResetUrl}</a>
              </p>

              <!-- Request details -->
              <div class="card-soft" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 24px;">
                <div class="text-strong" style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
                  Request details
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="meta-grid">
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;width:100px;">Time</td>
                    <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:500;">${safeTime}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;">IP address</td>
                    <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:500;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safeIp}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;">Device</td>
                    <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:500;">${safeDevice}</td>
                  </tr>
                </table>
                <p class="text-muted" style="margin:10px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                  Doesn't look familiar? Someone may have typed your email by mistake — or someone is trying to access your account.
                </p>
              </div>

              <!-- Safety callout -->
              <div style="border-left:3px solid #3a6bf0;padding:4px 0 4px 14px;margin:0 0 20px;">
                <p class="text-strong" style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a;">
                  Didn't ask for this?
                </p>
                <p class="text-muted" style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                  You can ignore this email — your password hasn't changed. If
                  you get more emails like this that you didn't request, write
                  to us at
                  <a href="mailto:${safeSupport}" style="color:#294fd4;text-decoration:none;font-weight:500;">${safeSupport}</a>.
                </p>
              </div>

              <!-- Why we sent this -->
              <p class="text-muted" style="margin:0;font-size:12px;color:#94a3b8;line-height:1.55;">
                We'll never ask for your password by email. Anything we send
                will always point you to
                <a href="${safeOrigin}" class="footer-link" style="color:#294fd4;text-decoration:none;">${safeOrigin}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 4px 0;">
              <p class="text-muted" style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                DocGen · Hyderabad, Telangana, India
              </p>
              <p class="text-muted" style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                <a href="${safeOrigin}/terms" class="footer-link" style="color:#64748b;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="${safeOrigin}/privacy" class="footer-link" style="color:#64748b;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="${safeOrigin}/disclaimer" class="footer-link" style="color:#64748b;text-decoration:none;">Legal disclaimer</a>
              </p>
              <p class="text-muted" style="margin:10px 0 0;font-size:11px;color:#cbd5e1;line-height:1.5;text-align:center;">
                This is a transactional email sent in response to a password-reset
                request on your account. It cannot be unsubscribed from.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

// ─── payment receipt ───────────────────────────────────────────────────────

export type PaymentReceiptKind = 'subscription' | 'verification';

export interface PaymentReceiptEmailParams {
  name: string;
  kind: PaymentReceiptKind;
  planLabel: string;
  /** Human-readable duration e.g. "30 days". Empty string for verification. */
  durationLabel: string;
  /** Formatted amount string e.g. "₹499.00" — formatted by the caller. */
  amountFormatted: string;
  invoiceNumber: string;
  /** ISO string or pre-formatted — we format it as IST here. */
  paidAt: Date;
  /** Formatted subscription end date (when kind='subscription'), or ''. */
  accessUntilLabel: string;
  /** URL back to the user's account page to re-download the invoice. */
  accountUrl: string;
}

export function renderPaymentReceiptEmail(
  params: PaymentReceiptEmailParams,
): { subject: string; html: string; text: string } {
  const {
    name,
    kind,
    planLabel,
    durationLabel,
    amountFormatted,
    invoiceNumber,
    paidAt,
    accessUntilLabel,
    accountUrl,
  } = params;

  const firstName = (name.split(' ')[0] || 'there').trim();
  const supportEmail = config.seller.email;
  const productOrigin = config.clientOrigin.replace(/\/+$/, '');
  const paidAtLabel = formatIstDateTime(paidAt);

  const isVerification = kind === 'verification';
  const subject = isVerification
    ? `Your DocGen verification receipt (${invoiceNumber})`
    : `Payment received — ${planLabel} (${invoiceNumber})`;

  const headline = isVerification
    ? 'Account verified — welcome aboard'
    : 'Payment received — thank you';

  const lede = isVerification
    ? `Your ₹1 verification charge cleared and your DocGen account is now verified. You can download any generated document right away.`
    : `Your ${planLabel} is active. The invoice for this payment is attached to this email as a PDF — you can also re-download it from your account any time.`;

  // ─── plain text ─────────────────────────────────────────────────────────
  const text = [
    `Hi ${firstName},`,
    '',
    isVerification
      ? `Your DocGen account has been verified. The invoice for your ₹1 charge is attached to this email.`
      : `Thanks for subscribing to ${planLabel}. Your invoice is attached to this email as a PDF.`,
    '',
    `— Payment details —`,
    `Invoice #: ${invoiceNumber}`,
    `Plan: ${planLabel}`,
    durationLabel ? `Duration: ${durationLabel}` : '',
    `Amount: ${amountFormatted}`,
    `Paid at: ${paidAtLabel}`,
    accessUntilLabel ? `Access until: ${accessUntilLabel}` : '',
    '',
    `You can download the invoice again from your account:`,
    accountUrl,
    '',
    `Questions about this charge? Email ${supportEmail} and include the`,
    `invoice number above — we'll sort it out quickly.`,
    '',
    `— The DocGen team`,
    `${productOrigin}`,
  ]
    .filter((l) => l !== '' || true) // keep blanks for readability
    .join('\n');

  // ─── HTML ───────────────────────────────────────────────────────────────
  const e = escapeHtml;
  const safeAccountUrl = e(accountUrl);
  const safeSupport = e(supportEmail);
  const safeOrigin = e(productOrigin);

  const metaRows: Array<[string, string, boolean?]> = [
    ['Invoice #', invoiceNumber, true],
    ['Plan', planLabel],
    ['Duration', durationLabel || '—'],
    ['Amount', amountFormatted, true],
    ['Paid at', paidAtLabel],
    ...(accessUntilLabel
      ? ([['Access until', accessUntilLabel]] as Array<[string, string]>)
      : []),
  ];

  const metaTable = metaRows
    .map(
      ([label, value, strong]) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:120px;">${e(label)}</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;${strong ? 'font-weight:600;' : 'font-weight:500;'}${label === 'Invoice #' || label === 'Amount' ? "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" : ''}">${e(value)}</td>
        </tr>`,
    )
    .join('');

  const badge = isVerification
    ? `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ecfdf5;color:#065f46;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Verification</span>`
    : `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eef5ff;color:#1c357f;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Subscription</span>`;

  const iconCell = isVerification
    ? `<span style="font-size:26px;">✅</span>`
    : `<span style="font-size:26px;">🧾</span>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${e(subject)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .card { background:#0f172a !important; color:#e2e8f0 !important; border-color:#1e293b !important; }
      .card-soft { background:#1e293b !important; border-color:#334155 !important; }
      .text-muted { color:#94a3b8 !important; }
      .text-strong { color:#f8fafc !important; }
      .shell { background:#020617 !important; }
      .footer-link { color:#93c5fd !important; }
    }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; padding:16px !important; }
      .card { padding:24px !important; }
      .meta-grid td { display:block !important; width:100% !important; padding:4px 0 !important; }
    }
  </style>
</head>
<body class="shell" style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${e(
      isVerification
        ? `Verification complete — invoice ${invoiceNumber} attached.`
        : `Payment of ${amountFormatted} received for ${planLabel}. Invoice ${invoiceNumber} attached.`,
    )}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <!-- Brand header -->
          <tr>
            <td style="padding:0 4px 20px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:40px;vertical-align:middle;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#3a6bf0 0%,#1c357f 100%);color:#ffffff;font-weight:700;font-size:18px;text-align:center;line-height:40px;">D</div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">DocGen</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="card" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">

              <div style="margin-bottom:18px;">
                <div style="width:52px;height:52px;border-radius:14px;background:#ecfdf5;display:inline-block;text-align:center;line-height:52px;vertical-align:middle;margin-right:10px;">
                  ${iconCell}
                </div>
                ${badge}
              </div>

              <h1 class="text-strong" style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#0f172a;font-weight:700;letter-spacing:-0.02em;">
                ${e(headline)}
              </h1>

              <p class="text-muted" style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#475569;">
                Hi ${e(firstName)},
              </p>
              <p class="text-muted" style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#475569;">
                ${e(lede)}
              </p>

              <!-- Payment details -->
              <div class="card-soft" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 24px;">
                <div class="text-strong" style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
                  Payment details
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="meta-grid">
                  ${metaTable}
                </table>
              </div>

              <!-- PDF attached callout -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
                <tr>
                  <td style="background:#eef5ff;border:1px solid #b6d2ff;border-radius:12px;padding:14px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="width:36px;vertical-align:middle;">
                          <div style="width:36px;height:36px;border-radius:8px;background:#294fd4;color:#fff;font-size:16px;font-weight:700;text-align:center;line-height:36px;">PDF</div>
                        </td>
                        <td style="padding-left:12px;vertical-align:middle;">
                          <div class="text-strong" style="font-size:14px;font-weight:600;color:#0f172a;">Invoice ${e(invoiceNumber)}.pdf</div>
                          <div class="text-muted" style="font-size:12px;color:#475569;">Attached to this email — keep for your records.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA button (bulletproof) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="border-radius:10px;background:#294fd4;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeAccountUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="21%" stroke="f" fillcolor="#294fd4">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;">View in your account</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${safeAccountUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;background:#294fd4;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                      View in your account
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p class="text-muted" style="margin:0 0 22px;font-size:13px;color:#64748b;line-height:1.55;">
                The invoice download, billing history and plan renewal all live on your
                <a href="${safeAccountUrl}" style="color:#294fd4;text-decoration:none;font-weight:500;">account page</a>.
              </p>

              <!-- Compliance note -->
              <div style="border-left:3px solid #3a6bf0;padding:4px 0 4px 14px;margin:0 0 20px;">
                <p class="text-strong" style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a;">
                  Keep this for your records
                </p>
                <p class="text-muted" style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                  We're currently an unregistered startup, so this invoice is issued as a
                  <strong>Bill of Supply</strong> (no GST). If you need a different billing
                  entity or a GST invoice later, write to
                  <a href="mailto:${safeSupport}" style="color:#294fd4;text-decoration:none;font-weight:500;">${safeSupport}</a>.
                </p>
              </div>

              <p class="text-muted" style="margin:0;font-size:12px;color:#94a3b8;line-height:1.55;">
                Questions about this payment? Reply to this email or write to
                <a href="mailto:${safeSupport}" class="footer-link" style="color:#294fd4;text-decoration:none;">${safeSupport}</a>
                — please include the invoice number so we can find it quickly.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 4px 0;">
              <p class="text-muted" style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                DocGen · Hyderabad, Telangana, India
              </p>
              <p class="text-muted" style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                <a href="${safeOrigin}/terms" class="footer-link" style="color:#64748b;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="${safeOrigin}/privacy" class="footer-link" style="color:#64748b;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="${safeOrigin}/refund-policy" class="footer-link" style="color:#64748b;text-decoration:none;">Refund policy</a>
              </p>
              <p class="text-muted" style="margin:10px 0 0;font-size:11px;color:#cbd5e1;line-height:1.5;text-align:center;">
                This is a transactional receipt for a payment on your account.
                It cannot be unsubscribed from.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
