import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { query, withTransaction } from '../db/pool';
import { BadRequestError } from '../utils/errors';
import { findUserByEmail, findUserById } from './userService';
import { revokeAllForUser } from './tokenService';
import {
  renderPasswordResetEmail,
  sendEmail,
} from './emailService';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateToken(): string {
  // 32 bytes → 64-char hex. Enough entropy to make brute-forcing irrelevant.
  return crypto.randomBytes(32).toString('hex');
}

function buildResetUrl(rawToken: string): string {
  // Frontend handles the reset form; server only issues + verifies tokens.
  const base = config.clientOrigin.replace(/\/+$/, '');
  return `${base}/reset-password?token=${rawToken}`;
}

/**
 * Issues a password-reset token for the matching account (if any) and emails
 * the link. The response is deliberately uniform — we never reveal whether
 * the email exists, to prevent user enumeration.
 */
export async function requestPasswordReset(params: {
  email: string;
  requesterIp: string | null;
  requesterUserAgent: string | null;
}): Promise<void> {
  const user = await findUserByEmail(params.email);
  if (!user) return; // silent no-op — caller still returns 200

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const ttlMinutes = config.passwordReset.ttlMinutes;
  const requestedAt = new Date();

  await query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at, requester_ip)
     values ($1, $2, now() + ($3 || ' minutes')::interval, $4)`,
    [user.id, tokenHash, String(ttlMinutes), params.requesterIp],
  );

  const { subject, html, text } = renderPasswordResetEmail({
    name: user.name,
    resetUrl: buildResetUrl(rawToken),
    ttlMinutes,
    requestedAt,
    requesterIp: params.requesterIp,
    requesterUserAgent: params.requesterUserAgent,
  });

  try {
    await sendEmail({ to: user.email, subject, html, text });
  } catch (err) {
    // We swallow delivery errors so the outward response stays uniform —
    // the token is still in the DB and will expire harmlessly if unused.
    console.error('[password-reset] email delivery failed:', err);
  }
}

/**
 * Verifies a raw reset token and sets a new password atomically. On success:
 *   - marks the token consumed (one-shot)
 *   - updates users.password_hash
 *   - revokes every active refresh token (forces log-out on other devices)
 */
export async function completePasswordReset(params: {
  rawToken: string;
  newPassword: string;
}): Promise<{ userId: string }> {
  const tokenHash = hashToken(params.rawToken);

  const userId = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `select id, user_id, expires_at, consumed_at
       from password_reset_tokens
       where token_hash = $1
       limit 1
       for update`,
      [tokenHash],
    );

    const row = rows[0];
    if (!row) throw new BadRequestError('Invalid or expired reset link');
    if (row.consumed_at) throw new BadRequestError('This reset link has already been used');
    if (row.expires_at.getTime() < Date.now()) {
      throw new BadRequestError('This reset link has expired. Request a new one.');
    }

    const passwordHash = await bcrypt.hash(params.newPassword, config.bcrypt.saltRounds);

    await client.query(
      `update users set password_hash = $2 where id = $1`,
      [row.user_id, passwordHash],
    );

    await client.query(
      `update password_reset_tokens set consumed_at = now() where id = $1`,
      [row.id],
    );

    return row.user_id;
  });

  // Best-effort: invalidate every existing refresh token so active sessions
  // on other devices are forcibly signed out. Out of the DB transaction on
  // purpose so a failure here doesn't roll back the password change.
  try {
    await revokeAllForUser(userId);
  } catch (err) {
    console.error('[password-reset] failed to revoke refresh tokens:', err);
  }

  const user = await findUserById(userId);
  if (!user) throw new BadRequestError('Account no longer exists');

  return { userId };
}
