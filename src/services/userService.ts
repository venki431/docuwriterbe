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
  created_at: Date;
  updated_at: Date;
}

const USER_COLUMNS = `
  id, name, email, password_hash, trial_ends_at,
  subscription_active_until, razorpay_customer_id, is_admin,
  verified_at, signup_ip, signup_user_agent, signup_locale,
  mobile_number, referral_code, referred_by_user_id,
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
  mobileNumber: string;
  trialDays: number;
  termsVersion: string;
  referralCode: string;
  signupIp?: string | null;
  signupUserAgent?: string | null;
  signupLocale?: string | null;
}): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `insert into users
       (name, email, password_hash, mobile_number, trial_ends_at,
        terms_accepted_at, terms_version,
        signup_ip, signup_user_agent, signup_locale,
        referral_code)
     values ($1, lower($2), $3, $4,
             now() + ($5 || ' days')::interval,
             now(), $6, $7, $8, $9,
             $10)
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
    ],
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
