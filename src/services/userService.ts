import { config } from '../config';
import { query } from '../db/pool';
import { AuthUser } from '../types/auth';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  trial_ends_at: Date;
  subscription_active_until: Date | null;
  razorpay_customer_id: string | null;
  is_admin: boolean;
  verified_at: Date | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  signup_locale: string | null;
  mobile_number: string | null;
  referral_code: string;
  referred_by_user_id: string | null;
  google_id: string | null;
  auth_provider: 'email' | 'google';
  created_at: Date;
  updated_at: Date;
}

const USER_COLUMNS = `
  id, name, email, password_hash, trial_ends_at,
  subscription_active_until, razorpay_customer_id, is_admin,
  verified_at, signup_ip, signup_user_agent, signup_locale,
  mobile_number, referral_code, referred_by_user_id,
  google_id, auth_provider,
  created_at, updated_at
`;

export function isAdminEmail(email: string): boolean {
  return config.admin.emails.includes(email.toLowerCase());
}

export function rowToAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    trialEndsAt: row.trial_ends_at.toISOString(),
    subscriptionActiveUntil: row.subscription_active_until
      ? row.subscription_active_until.toISOString()
      : null,
    isAdmin: row.is_admin || isAdminEmail(row.email),
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
    mobileNumber: row.mobile_number,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `select ${USER_COLUMNS} from users where lower(email) = lower($1) limit 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `select ${USER_COLUMNS} from users where id = $1 limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertUser(params: {
  name: string;
  email: string;
  passwordHash: string;
  // Optional for Google signups (Google doesn't return a phone number).
  // The DB column is nullable; the partial unique index ignores nulls.
  mobileNumber: string | null;
  trialDays: number;
  termsVersion: string;
  referralCode: string;
  authProvider?: 'email' | 'google';
  googleId?: string | null;
  signupIp?: string | null;
  signupUserAgent?: string | null;
  signupLocale?: string | null;
}): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `insert into users
       (name, email, password_hash, mobile_number, trial_ends_at,
        terms_accepted_at, terms_version,
        signup_ip, signup_user_agent, signup_locale,
        referral_code, auth_provider, google_id)
     values ($1, lower($2), $3, $4,
             now() + ($5 || ' days')::interval,
             now(), $6, $7, $8, $9,
             $10, $11, $12)
     returning ${USER_COLUMNS}`,
    [
      params.name,
      params.email,
      params.passwordHash,
      params.mobileNumber,
      String(params.trialDays),
      params.termsVersion,
      params.signupIp ?? null,
      params.signupUserAgent ?? null,
      params.signupLocale ?? null,
      params.referralCode,
      params.authProvider ?? 'email',
      params.googleId ?? null,
    ],
  );
  return rows[0];
}

export async function findUserByGoogleId(
  googleId: string,
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `select ${USER_COLUMNS} from users where google_id = $1 limit 1`,
    [googleId],
  );
  return rows[0] ?? null;
}

/**
 * Attaches a Google account to an existing email/password user. Used in the
 * auto-link path: same email signs in via Google → we record google_id but
 * deliberately leave `auth_provider` untouched so password access keeps
 * working.
 */
export async function attachGoogleIdToUser(
  userId: string,
  googleId: string,
): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `update users set google_id = $2
     where id = $1 and google_id is null
     returning ${USER_COLUMNS}`,
    [userId, googleId],
  );
  return rows[0];
}

export async function markUserVerified(userId: string): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `update users set verified_at = coalesce(verified_at, now())
     where id = $1
     returning ${USER_COLUMNS}`,
    [userId],
  );
  return rows[0];
}

export async function updateUserProfile(
  id: string,
  patch: { name?: string; email?: string },
): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `update users set
       name  = coalesce($2, name),
       email = coalesce(lower($3), email)
     where id = $1
     returning ${USER_COLUMNS}`,
    [id, patch.name ?? null, patch.email ?? null],
  );
  return rows[0];
}

export async function extendSubscription(
  userId: string,
  durationDays: number,
): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `update users
     set subscription_active_until =
       greatest(coalesce(subscription_active_until, now()), now())
       + ($2 || ' days')::interval
     where id = $1
     returning ${USER_COLUMNS}`,
    [userId, String(durationDays)],
  );
  return rows[0];
}
