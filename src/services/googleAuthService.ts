import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { BadRequestError } from '../utils/errors';
import {
  attachGoogleIdToUser,
  findUserByEmail,
  findUserByGoogleId,
  insertUser,
  rowToAuthUser,
} from './userService';
import {
  attachReferralOnSignup,
  generateUniqueReferralCode,
} from './referralService';
import { renderWelcomeEmail, sendEmail } from './emailService';
import { signAccessToken, persistRefreshToken, signRefreshToken } from './tokenService';
import { AuthUser } from '../types/auth';

let lazyClient: OAuth2Client | null = null;
function client(): OAuth2Client {
  if (!lazyClient) {
    lazyClient = new OAuth2Client(config.googleAuth.clientId);
  }
  return lazyClient;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/**
 * Verifies the ID token Google returned to the frontend. Confirms:
 *  - signature is valid (Google's RSA pubkeys, fetched + cached by the lib)
 *  - audience matches our client_id (so a token minted for someone else's app
 *    can't be replayed against ours)
 *  - issuer is accounts.google.com
 *  - token isn't expired
 *
 * Throws BadRequestError on any failure — never leaks the underlying lib
 * error to the client.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!config.googleAuth.enabled) {
    throw new BadRequestError('Google sign-in is not enabled');
  }
  let payload;
  try {
    const ticket = await client().verifyIdToken({
      idToken,
      audience: config.googleAuth.clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new BadRequestError('Invalid Google credential');
  }
  if (!payload) throw new BadRequestError('Invalid Google credential');
  if (!payload.sub) throw new BadRequestError('Google response missing subject');
  if (!payload.email) throw new BadRequestError('Google response missing email');
  // We require Google to have verified the email itself — otherwise an
  // attacker could create a Google account with someone else's email and
  // use it to log into that victim's existing DocGen account.
  if (!payload.email_verified) {
    throw new BadRequestError(
      'Your Google email address is not verified. Verify it with Google first.',
    );
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: payload.name?.trim() || payload.email.split('@')[0],
    picture: payload.picture ?? null,
  };
}

async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken(userId, email);
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken(userId, jti);
  await persistRefreshToken(userId, jti, refreshToken);
  return { accessToken, refreshToken };
}

export interface GoogleAuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  /** True if this call created a new account; false if it logged into / linked an existing one. */
  isNewUser: boolean;
}

/**
 * One-shot Google sign-in entry point. Caller hands us a verified Google
 * profile (by way of `verifyGoogleIdToken`) plus an optional referral code
 * captured from `?ref=...` on the marketing page.
 *
 * Branching:
 *  1. We already know this google_id     → straight login.
 *  2. We don't know the google_id, but the email is on file → AUTO-LINK
 *     attach google_id to the existing row, log in. We DON'T touch
 *     `auth_provider` — the user keeps password access if they had it.
 *  3. New email + new google_id          → create user with auth_provider='google'.
 */
export async function signInWithGoogle(params: {
  profile: GoogleProfile;
  referralCode?: string | null;
  signupIp?: string | null;
  signupUserAgent?: string | null;
  signupLocale?: string | null;
}): Promise<GoogleAuthResult> {
  const { profile } = params;

  // (1) Repeat Google login.
  const byGoogle = await findUserByGoogleId(profile.googleId);
  if (byGoogle) {
    const tokens = await issueTokenPair(byGoogle.id, byGoogle.email);
    return { user: rowToAuthUser(byGoogle), ...tokens, isNewUser: false };
  }

  // (2) Email already taken (likely password signup) → auto-link.
  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    const linked = await attachGoogleIdToUser(byEmail.id, profile.googleId);
    // attachGoogleIdToUser may return undefined if a concurrent linker won
    // the update. Fall back to the original row in that case — the user
    // is still authenticated as the same account.
    const user = linked ?? byEmail;
    const tokens = await issueTokenPair(user.id, user.email);
    return { user: rowToAuthUser(user), ...tokens, isNewUser: false };
  }

  // (3) Brand-new user → create.
  // Random password they don't know — keeps the NOT NULL constraint and lets
  // the user reach email/password access later via the existing /forgot-password
  // reset flow if they want it.
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, config.bcrypt.saltRounds);
  const referralCode = await generateUniqueReferralCode();

  const row = await insertUser({
    name: profile.name,
    email: profile.email,
    passwordHash,
    mobileNumber: null, // Google doesn't return a phone number.
    trialDays: config.trial.days,
    termsVersion: '1.0.0',
    referralCode,
    authProvider: 'google',
    googleId: profile.googleId,
    signupIp: params.signupIp ?? null,
    signupUserAgent: params.signupUserAgent ?? null,
    signupLocale: params.signupLocale ?? null,
  });

  // Best-effort: hook the same referral logic email signup uses. Failures
  // here must not break account creation.
  try {
    await attachReferralOnSignup({
      newUserId: row.id,
      newUserSignupIp: row.signup_ip,
      referralCode: params.referralCode ?? null,
    });
  } catch (err) {
    console.error('[google-auth] referral attach failed:', err);
  }

  // Same fire-and-forget welcome email as the password signup path.
  void (async () => {
    try {
      const { subject, html, text } = renderWelcomeEmail({
        name: row.name,
        trialDays: config.trial.days,
        trialEndsAt: row.trial_ends_at,
      });
      await sendEmail({ to: row.email, subject, html, text });
    } catch (err) {
      console.error('[google-auth] welcome email failed:', err);
    }
  })();

  const tokens = await issueTokenPair(row.id, row.email);
  return { user: rowToAuthUser(row), ...tokens, isNewUser: true };
}
