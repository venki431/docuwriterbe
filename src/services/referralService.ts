import { PoolClient } from 'pg';
import { config } from '../config';
import { query, withTransaction } from '../db/pool';
import { BadRequestError, NotFoundError } from '../utils/errors';

// Crockford-ish alphabet — 31 chars, no 0/O/I/1 so codes survive being read
// aloud or hand-copied off WhatsApp. Length 8 → 31^8 ≈ 850 billion combos.
const REFERRAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ';
const REFERRAL_CODE_LENGTH = 8;

export function generateReferralCode(): string {
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_ALPHABET.charAt(
      Math.floor(Math.random() * REFERRAL_ALPHABET.length),
    );
  }
  return out;
}

/**
 * Generates a referral code that doesn't already exist in `users`. Falls back
 * to throwing after 8 attempts — at 31^8 keyspace, hitting that ceiling means
 * something is very wrong (and we'd rather fail loud than emit a duplicate).
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode();
    const { rows } = await query<{ id: string }>(
      `select id from users where referral_code = $1 limit 1`,
      [code],
    );
    if (rows.length === 0) return code;
  }
  throw new Error('Failed to generate a unique referral code after 8 attempts');
}

export function buildReferralShareUrl(code: string): string {
  const base = config.clientOrigin.replace(/\/+$/, '');
  return `${base}/signup?ref=${encodeURIComponent(code)}`;
}

interface ReferrerLookup {
  id: string;
  signupIp: string | null;
}

export async function findReferrerByCode(
  code: string,
): Promise<ReferrerLookup | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const { rows } = await query<{ id: string; signup_ip: string | null }>(
    `select id, signup_ip from users where referral_code = $1 limit 1`,
    [norm],
  );
  return rows[0] ? { id: rows[0].id, signupIp: rows[0].signup_ip } : null;
}

type ReferralStatus = 'pending' | 'completed' | 'flagged';

function evaluateAbuse(
  newUserSignupIp: string | null,
  referrerSignupIp: string | null,
): { status: ReferralStatus; flaggedReason: string | null } {
  // Soft IP-overlap heuristic. Same household / same NAT / two-accounts-on-one-
  // phone all show up as identical signup IP — we let the signup proceed
  // (so we don't punish people whose families both want accounts) but we
  // refuse to credit the referral reward.
  if (newUserSignupIp && referrerSignupIp && newUserSignupIp === referrerSignupIp) {
    return { status: 'flagged', flaggedReason: 'shared_signup_ip' };
  }
  return { status: 'pending', flaggedReason: null };
}

/**
 * Records a pending (or flagged) referral for a brand-new user. Called from
 * `authService.signup` AFTER the user row has been created. Failures here
 * must NEVER bubble up to break signup — bad referral codes, race conditions,
 * etc. are all silent no-ops on the signup happy path.
 */
export async function attachReferralOnSignup(params: {
  newUserId: string;
  newUserSignupIp: string | null;
  referralCode: string | null | undefined;
}): Promise<void> {
  if (!params.referralCode) return;
  const referrer = await findReferrerByCode(params.referralCode);
  if (!referrer) return;
  if (referrer.id === params.newUserId) return; // self-referral, silent ignore

  const { status, flaggedReason } = evaluateAbuse(
    params.newUserSignupIp,
    referrer.signupIp,
  );

  await withTransaction(async (client) => {
    await client.query(
      `update users
         set referred_by_user_id = $2
       where id = $1 and referred_by_user_id is null`,
      [params.newUserId, referrer.id],
    );
    // ON CONFLICT guards against the (extremely rare) race where two flows
    // try to attach a referral for the same user simultaneously.
    await client.query(
      `insert into referrals (referrer_user_id, referred_user_id, status, flagged_reason)
       values ($1, $2, $3, $4)
       on conflict (referred_user_id) do nothing`,
      [referrer.id, params.newUserId, status, flaggedReason],
    );
  });
}

/**
 * Post-signup application of a referral code — for the case where a user
 * landed via SEO without `?ref=...`, found out about the program, and now
 * wants to credit a friend before completing verification.
 *
 * Only allowed while the user is still UNVERIFIED and has NO existing
 * referrer — both rules close the obvious gaming loops.
 */
export async function applyReferralCode(params: {
  userId: string;
  code: string;
}): Promise<{ status: ReferralStatus }> {
  const code = params.code.trim().toUpperCase();
  if (!code) throw new BadRequestError('Referral code is required');

  const { rows: meRows } = await query<{
    id: string;
    verified_at: Date | null;
    referred_by_user_id: string | null;
    signup_ip: string | null;
    referral_code: string;
  }>(
    `select id, verified_at, referred_by_user_id, signup_ip, referral_code
     from users where id = $1`,
    [params.userId],
  );
  const me = meRows[0];
  if (!me) throw new NotFoundError('User not found');

  if (me.referred_by_user_id) {
    throw new BadRequestError(
      'A referral code is already applied to this account',
    );
  }
  if (me.verified_at) {
    throw new BadRequestError(
      'Referral codes can only be applied before account verification',
    );
  }
  if (me.referral_code === code) {
    throw new BadRequestError('You cannot use your own referral code');
  }

  const referrer = await findReferrerByCode(code);
  if (!referrer) throw new BadRequestError('Invalid referral code');
  if (referrer.id === me.id) {
    throw new BadRequestError('You cannot use your own referral code');
  }

  const { status, flaggedReason } = evaluateAbuse(me.signup_ip, referrer.signupIp);

  await withTransaction(async (client) => {
    await client.query(
      `update users
         set referred_by_user_id = $2
       where id = $1 and referred_by_user_id is null`,
      [me.id, referrer.id],
    );
    await client.query(
      `insert into referrals (referrer_user_id, referred_user_id, status, flagged_reason)
       values ($1, $2, $3, $4)
       on conflict (referred_user_id) do nothing`,
      [referrer.id, me.id, status, flaggedReason],
    );
  });

  return { status };
}

/**
 * Idempotent reward grant. MUST be called inside a billing transaction —
 * the SELECT FOR UPDATE on `referrals` is what serialises concurrent
 * /verify and webhook calls so we can't double-credit a referrer.
 *
 * Returns whether a reward was given on THIS call. Subsequent calls for the
 * same referee (e.g. webhook retry after a successful /verify) return
 * `{ rewarded: false }` because the row will already be `completed`.
 */
export async function awardReferralIfPending(
  client: PoolClient,
  referredUserId: string,
): Promise<{ rewarded: boolean; days: number }> {
  const rewardDays = config.referral.rewardDays;
  const { rows } = await client.query<{
    id: string;
    referrer_user_id: string;
    status: string;
    reward_given_at: Date | null;
  }>(
    `select id, referrer_user_id, status, reward_given_at
     from referrals
     where referred_user_id = $1
     for update`,
    [referredUserId],
  );
  const ref = rows[0];
  if (!ref) return { rewarded: false, days: 0 };
  if (ref.status !== 'pending' || ref.reward_given_at) {
    return { rewarded: false, days: 0 };
  }

  await client.query(
    `update referrals
     set status = 'completed',
         reward_given_at = now(),
         reward_days = $2
     where id = $1`,
    [ref.id, rewardDays],
  );

  await client.query(
    `update users
     set trial_ends_at = greatest(trial_ends_at, now()) + ($2 || ' days')::interval
     where id = $1`,
    [ref.referrer_user_id, String(rewardDays)],
  );

  return { rewarded: true, days: rewardDays };
}

// ─── status / link endpoints ───────────────────────────────────────────────

export interface ReferralInvitee {
  email: string;
  name: string;
  status: ReferralStatus;
  rewardedAt: string | null;
  joinedAt: string;
}

export interface ReferralStatusResponse {
  /** The user's own referral code. Always present (generated at signup). */
  code: string;
  /** Share URL — only emitted once the user is verified. */
  shareUrl: string | null;
  isVerified: boolean;
  rewardDaysPerReferral: number;
  totalRewardDaysEarned: number;
  invitees: ReferralInvitee[];
  /** If this user themselves came in via someone else's code, this is the link back. */
  appliedReferral: {
    referrerName: string;
    status: ReferralStatus;
    flaggedReason: string | null;
  } | null;
}

export async function getReferralStatus(
  userId: string,
): Promise<ReferralStatusResponse> {
  const { rows: meRows } = await query<{
    id: string;
    referral_code: string;
    verified_at: Date | null;
    referred_by_user_id: string | null;
  }>(
    `select id, referral_code, verified_at, referred_by_user_id
     from users where id = $1`,
    [userId],
  );
  const me = meRows[0];
  if (!me) throw new NotFoundError('User not found');

  const isVerified = me.verified_at !== null;
  const shareUrl = isVerified ? buildReferralShareUrl(me.referral_code) : null;

  const { rows: invRows } = await query<{
    name: string;
    email: string;
    status: string;
    reward_given_at: Date | null;
    reward_days: number | null;
    joined: Date;
  }>(
    `select u.name, u.email,
            r.status, r.reward_given_at, r.reward_days,
            u.created_at as joined
     from referrals r
     join users u on u.id = r.referred_user_id
     where r.referrer_user_id = $1
     order by u.created_at desc`,
    [userId],
  );

  const invitees: ReferralInvitee[] = invRows.map((r) => ({
    name: r.name,
    email: r.email,
    status: r.status as ReferralStatus,
    rewardedAt: r.reward_given_at ? r.reward_given_at.toISOString() : null,
    joinedAt: r.joined.toISOString(),
  }));

  const totalRewardDaysEarned = invRows
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + (r.reward_days ?? 0), 0);

  let appliedReferral: ReferralStatusResponse['appliedReferral'] = null;
  if (me.referred_by_user_id) {
    const { rows: refRows } = await query<{
      name: string;
      status: string;
      flagged_reason: string | null;
    }>(
      `select u.name, r.status, r.flagged_reason
       from referrals r
       join users u on u.id = r.referrer_user_id
       where r.referred_user_id = $1`,
      [userId],
    );
    if (refRows[0]) {
      appliedReferral = {
        referrerName: refRows[0].name,
        status: refRows[0].status as ReferralStatus,
        flaggedReason: refRows[0].flagged_reason,
      };
    }
  }

  return {
    code: me.referral_code,
    shareUrl,
    isVerified,
    rewardDaysPerReferral: config.referral.rewardDays,
    totalRewardDaysEarned,
    invitees,
    appliedReferral,
  };
}

export async function getReferralLink(
  userId: string,
): Promise<{ code: string; shareUrl: string }> {
  const { rows } = await query<{
    referral_code: string;
    verified_at: Date | null;
  }>(
    `select referral_code, verified_at from users where id = $1`,
    [userId],
  );
  const me = rows[0];
  if (!me) throw new NotFoundError('User not found');
  if (!me.verified_at) {
    throw new BadRequestError(
      'Complete the ₹1 verification to unlock your referral link',
    );
  }
  return { code: me.referral_code, shareUrl: buildReferralShareUrl(me.referral_code) };
}
