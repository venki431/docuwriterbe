import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors';
import { isDisposableEmail } from '../utils/disposableEmails';
import {
  findUserByEmail,
  findUserById,
  insertUser,
  rowToAuthUser,
} from './userService';
import {
  consumeRefreshToken,
  persistRefreshToken,
  revokeAllForUser,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './tokenService';
import { renderWelcomeEmail, sendEmail } from './emailService';
import { AuthUser } from '../types/auth';

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken(userId, email);
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken(userId, jti);
  await persistRefreshToken(userId, jti, refreshToken);
  return { accessToken, refreshToken };
}

export async function signup(params: {
  name: string;
  email: string;
  password: string;
  mobileNumber: string;
  termsVersion: string;
  signupIp?: string | null;
  signupUserAgent?: string | null;
  signupLocale?: string | null;
}): Promise<AuthResult> {
  if (isDisposableEmail(params.email)) {
    throw new BadRequestError(
      'Please use a non-disposable email address. Temporary / throwaway email providers are not supported.',
    );
  }

  const existing = await findUserByEmail(params.email);
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await bcrypt.hash(params.password, config.bcrypt.saltRounds);
  try {
    const row = await insertUser({
      name: params.name.trim(),
      email: params.email,
      passwordHash,
      mobileNumber: params.mobileNumber,
      trialDays: config.trial.days,
      termsVersion: params.termsVersion,
      signupIp: params.signupIp ?? null,
      signupUserAgent: params.signupUserAgent ?? null,
      signupLocale: params.signupLocale ?? null,
    });

    const tokens = await issueTokenPair(row.id, row.email);

    // Fire-and-forget welcome email. A delivery failure must not block signup —
    // the account is already created and the user is being logged in below.
    void (async () => {
      try {
        const { subject, html, text } = renderWelcomeEmail({
          name: row.name,
          trialDays: config.trial.days,
          trialEndsAt: row.trial_ends_at,
        });
        await sendEmail({ to: row.email, subject, html, text });
      } catch (err) {
        console.error('[welcome-email] delivery failed:', err);
      }
    })();

    return { user: rowToAuthUser(row), ...tokens };
  } catch (err) {
    // Partial-unique index on mobile_number → Postgres error code 23505.
    if (typeof err === 'object' && err && (err as { code?: string }).code === '23505') {
      throw new ConflictError(
        'This mobile number is already linked to another account',
      );
    }
    throw err;
  }
}

export async function login(params: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const row = await findUserByEmail(params.email);
  if (!row) throw new UnauthorizedError('Invalid email or password');

  const ok = await bcrypt.compare(params.password, row.password_hash);
  if (!ok) throw new UnauthorizedError('Invalid email or password');

  const tokens = await issueTokenPair(row.id, row.email);
  return { user: rowToAuthUser(row), ...tokens };
}

export async function refresh(rawRefreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const consumed = await consumeRefreshToken(payload.jti, rawRefreshToken);
  if (!consumed) throw new UnauthorizedError('Refresh token already used or revoked');

  const row = await findUserById(payload.sub);
  if (!row) throw new UnauthorizedError('User no longer exists');

  const tokens = await issueTokenPair(row.id, row.email);
  return { user: rowToAuthUser(row), ...tokens };
}

export async function logout(userId: string): Promise<void> {
  await revokeAllForUser(userId);
}
