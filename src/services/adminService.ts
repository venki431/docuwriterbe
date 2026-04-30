import { query } from '../db/pool';

export interface AdminStats {
  users: {
    total: number;
    trialing: number;
    active: number;
    expired: number;
    newLast24h: number;
    unverified: number;
  };
  revenue: {
    allTimePaise: number;
    last24hPaise: number;
    last30dPaise: number;
  };
  transactions: {
    paidLast24h: number;
    failedLast24h: number;
    pending: number;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const { rows: userStats } = await query<{
    total: string;
    trialing: string;
    active: string;
    expired: string;
    new_last_24h: string;
    unverified: string;
  }>(
    `select
       count(*) as total,
       count(*) filter (
         where trial_ends_at > now()
         and (subscription_active_until is null or subscription_active_until < now())
       ) as trialing,
       count(*) filter (
         where subscription_active_until >= now()
       ) as active,
       count(*) filter (
         where trial_ends_at <= now()
         and (subscription_active_until is null or subscription_active_until < now())
       ) as expired,
       count(*) filter (where created_at > now() - interval '24 hours') as new_last_24h,
       count(*) filter (where verified_at is null) as unverified
     from users`,
  );

  const { rows: revenueStats } = await query<{
    all_time: string | null;
    last_24h: string | null;
    last_30d: string | null;
  }>(
    `select
       coalesce(sum(amount_paise) filter (where status = 'paid'), 0) as all_time,
       coalesce(
         sum(amount_paise) filter (where status = 'paid' and updated_at > now() - interval '24 hours'),
         0
       ) as last_24h,
       coalesce(
         sum(amount_paise) filter (where status = 'paid' and updated_at > now() - interval '30 days'),
         0
       ) as last_30d
     from transactions`,
  );

  const { rows: txStats } = await query<{
    paid_24h: string;
    failed_24h: string;
    pending: string;
  }>(
    `select
       count(*) filter (where status = 'paid' and updated_at > now() - interval '24 hours') as paid_24h,
       count(*) filter (where status = 'failed' and updated_at > now() - interval '24 hours') as failed_24h,
       count(*) filter (where status = 'created') as pending
     from transactions`,
  );

  const u = userStats[0];
  const r = revenueStats[0];
  const t = txStats[0];
  return {
    users: {
      total: Number(u.total),
      trialing: Number(u.trialing),
      active: Number(u.active),
      expired: Number(u.expired),
      newLast24h: Number(u.new_last_24h),
      unverified: Number(u.unverified),
    },
    revenue: {
      allTimePaise: Number(r.all_time ?? 0),
      last24hPaise: Number(r.last_24h ?? 0),
      last30dPaise: Number(r.last_30d ?? 0),
    },
    transactions: {
      paidLast24h: Number(t.paid_24h),
      failedLast24h: Number(t.failed_24h),
      pending: Number(t.pending),
    },
  };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  mobileNumber: string | null;
  trialEndsAt: string;
  subscriptionActiveUntil: string | null;
  isAdmin: boolean;
  createdAt: string;
  state: 'trial' | 'active' | 'expired';
  verifiedAt: string | null;
  signupIp: string | null;
  accountsFromSameIp: number;
}

export async function listRecentUsers(limit = 20): Promise<AdminUserRow[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    mobile_number: string | null;
    trial_ends_at: Date;
    subscription_active_until: Date | null;
    is_admin: boolean;
    verified_at: Date | null;
    signup_ip: string | null;
    created_at: Date;
    accounts_from_same_ip: string;
  }>(
    `select u.id, u.name, u.email, u.mobile_number,
            u.trial_ends_at, u.subscription_active_until,
            u.is_admin, u.verified_at, u.signup_ip, u.created_at,
            coalesce(s.cnt, 1) as accounts_from_same_ip
     from users u
     left join lateral (
       select count(*) as cnt
       from users u2
       where u2.signup_ip is not null
         and u2.signup_ip = u.signup_ip
         and u2.created_at > now() - interval '30 days'
     ) s on true
     order by u.created_at desc
     limit $1`,
    [limit],
  );
  const now = Date.now();
  return rows.map((r) => {
    const trialEnds = r.trial_ends_at.getTime();
    const subUntil = r.subscription_active_until
      ? r.subscription_active_until.getTime()
      : 0;
    let state: AdminUserRow['state'];
    if (subUntil > now) state = 'active';
    else if (trialEnds > now) state = 'trial';
    else state = 'expired';
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      mobileNumber: r.mobile_number,
      trialEndsAt: r.trial_ends_at.toISOString(),
      subscriptionActiveUntil: r.subscription_active_until
        ? r.subscription_active_until.toISOString()
        : null,
      isAdmin: r.is_admin,
      createdAt: r.created_at.toISOString(),
      state,
      verifiedAt: r.verified_at ? r.verified_at.toISOString() : null,
      signupIp: r.signup_ip,
      accountsFromSameIp: Number(r.accounts_from_same_ip ?? 1),
    };
  });
}

export interface AdminTransactionRow {
  id: string;
  userEmail: string | null;
  userName: string | null;
  status: string;
  planId: string | null;
  durationDays: number | null;
  amountPaise: number;
  currency: string;
  invoiceNumber: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  createdAt: string;
}

export async function listRecentTransactions(
  limit = 20,
): Promise<AdminTransactionRow[]> {
  const { rows } = await query<{
    id: string;
    user_email: string | null;
    user_name: string | null;
    status: string;
    plan_id: string | null;
    duration_days: number | null;
    amount_paise: number;
    currency: string;
    invoice_number: string | null;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    created_at: Date;
  }>(
    `select t.id, u.email as user_email, u.name as user_name, t.status, t.plan_id,
            t.duration_days, t.amount_paise, t.currency, t.invoice_number,
            t.razorpay_order_id, t.razorpay_payment_id, t.created_at
     from transactions t
     left join users u on u.id = t.user_id
     order by t.created_at desc
     limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    userName: r.user_name,
    status: r.status,
    planId: r.plan_id,
    durationDays: r.duration_days,
    amountPaise: r.amount_paise,
    currency: r.currency,
    invoiceNumber: r.invoice_number,
    razorpayOrderId: r.razorpay_order_id,
    razorpayPaymentId: r.razorpay_payment_id,
    createdAt: r.created_at.toISOString(),
  }));
}

// ─── paginated lists ──────────────────────────────────────────────────────

export type UserStateFilter =
  | 'all'
  | 'trial'
  | 'active'
  | 'expired'
  | 'unverified'
  | 'admin';

export interface ListUsersParams {
  q?: string | null;
  state?: UserStateFilter;
  page?: number;
  pageSize?: number;
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

function clampPageSize(n: number | undefined): number {
  const v = Math.floor(Number(n) || 25);
  if (v < 1) return 25;
  if (v > 100) return 100;
  return v;
}

function clampPage(n: number | undefined): number {
  const v = Math.floor(Number(n) || 1);
  return v < 1 ? 1 : v;
}

export async function listUsers(
  params: ListUsersParams,
): Promise<PagedResult<AdminUserRow>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const offset = (page - 1) * pageSize;
  const state: UserStateFilter = params.state ?? 'all';

  // Build WHERE incrementally with positional params so values stay
  // parameterised — never interpolated.
  const where: string[] = [];
  const args: unknown[] = [];

  const q = (params.q ?? '').trim();
  if (q) {
    args.push(`%${q}%`);
    const i = args.length;
    where.push(
      `(u.name ilike $${i} or u.email ilike $${i} or u.mobile_number ilike $${i} or u.signup_ip ilike $${i})`,
    );
  }

  if (state === 'trial') {
    where.push(
      `(u.trial_ends_at > now() and (u.subscription_active_until is null or u.subscription_active_until < now()))`,
    );
  } else if (state === 'active') {
    where.push(`u.subscription_active_until >= now()`);
  } else if (state === 'expired') {
    where.push(
      `(u.trial_ends_at <= now() and (u.subscription_active_until is null or u.subscription_active_until < now()))`,
    );
  } else if (state === 'unverified') {
    where.push(`u.verified_at is null`);
  } else if (state === 'admin') {
    where.push(`u.is_admin = true`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const { rows: countRows } = await query<{ total: string }>(
    `select count(*)::text as total from users u ${whereSql}`,
    args,
  );
  const total = Number(countRows[0]?.total ?? 0);

  args.push(pageSize, offset);
  const limitIdx = args.length - 1;
  const offsetIdx = args.length;

  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    mobile_number: string | null;
    trial_ends_at: Date;
    subscription_active_until: Date | null;
    is_admin: boolean;
    verified_at: Date | null;
    signup_ip: string | null;
    created_at: Date;
    accounts_from_same_ip: string;
  }>(
    `select u.id, u.name, u.email, u.mobile_number,
            u.trial_ends_at, u.subscription_active_until,
            u.is_admin, u.verified_at, u.signup_ip, u.created_at,
            coalesce(s.cnt, 1) as accounts_from_same_ip
     from users u
     left join lateral (
       select count(*) as cnt
       from users u2
       where u2.signup_ip is not null
         and u2.signup_ip = u.signup_ip
         and u2.created_at > now() - interval '30 days'
     ) s on true
     ${whereSql}
     order by u.created_at desc
     limit $${limitIdx} offset $${offsetIdx}`,
    args,
  );

  const now = Date.now();
  const out: AdminUserRow[] = rows.map((r) => {
    const trialEnds = r.trial_ends_at.getTime();
    const subUntil = r.subscription_active_until
      ? r.subscription_active_until.getTime()
      : 0;
    let s: AdminUserRow['state'];
    if (subUntil > now) s = 'active';
    else if (trialEnds > now) s = 'trial';
    else s = 'expired';
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      mobileNumber: r.mobile_number,
      trialEndsAt: r.trial_ends_at.toISOString(),
      subscriptionActiveUntil: r.subscription_active_until
        ? r.subscription_active_until.toISOString()
        : null,
      isAdmin: r.is_admin,
      createdAt: r.created_at.toISOString(),
      state: s,
      verifiedAt: r.verified_at ? r.verified_at.toISOString() : null,
      signupIp: r.signup_ip,
      accountsFromSameIp: Number(r.accounts_from_same_ip ?? 1),
    };
  });

  return { rows: out, total, page, pageSize };
}

export type TransactionStatusFilter =
  | 'all'
  | 'created'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface ListTransactionsParams {
  q?: string | null;
  status?: TransactionStatusFilter;
  planId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(
  params: ListTransactionsParams,
): Promise<PagedResult<AdminTransactionRow>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const args: unknown[] = [];

  const q = (params.q ?? '').trim();
  if (q) {
    args.push(`%${q}%`);
    const i = args.length;
    where.push(
      `(u.email ilike $${i} or u.name ilike $${i} or t.invoice_number ilike $${i} or t.razorpay_order_id ilike $${i} or t.razorpay_payment_id ilike $${i})`,
    );
  }

  const status: TransactionStatusFilter = params.status ?? 'all';
  if (status !== 'all') {
    args.push(status);
    where.push(`t.status = $${args.length}`);
  }

  const planId = (params.planId ?? '').trim();
  if (planId) {
    args.push(planId);
    where.push(`t.plan_id = $${args.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const { rows: countRows } = await query<{ total: string }>(
    `select count(*)::text as total
     from transactions t
     left join users u on u.id = t.user_id
     ${whereSql}`,
    args,
  );
  const total = Number(countRows[0]?.total ?? 0);

  args.push(pageSize, offset);
  const limitIdx = args.length - 1;
  const offsetIdx = args.length;

  const { rows } = await query<{
    id: string;
    user_email: string | null;
    user_name: string | null;
    status: string;
    plan_id: string | null;
    duration_days: number | null;
    amount_paise: number;
    currency: string;
    invoice_number: string | null;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    created_at: Date;
  }>(
    `select t.id, u.email as user_email, u.name as user_name, t.status, t.plan_id,
            t.duration_days, t.amount_paise, t.currency, t.invoice_number,
            t.razorpay_order_id, t.razorpay_payment_id, t.created_at
     from transactions t
     left join users u on u.id = t.user_id
     ${whereSql}
     order by t.created_at desc
     limit $${limitIdx} offset $${offsetIdx}`,
    args,
  );

  const out: AdminTransactionRow[] = rows.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    userName: r.user_name,
    status: r.status,
    planId: r.plan_id,
    durationDays: r.duration_days,
    amountPaise: r.amount_paise,
    currency: r.currency,
    invoiceNumber: r.invoice_number,
    razorpayOrderId: r.razorpay_order_id,
    razorpayPaymentId: r.razorpay_payment_id,
    createdAt: r.created_at.toISOString(),
  }));

  return { rows: out, total, page, pageSize };
}

// ─── per-user detail drawer ───────────────────────────────────────────────

export interface AdminUserDetail {
  user: AdminUserRow & {
    signupUserAgent: string | null;
    signupLocale: string | null;
    razorpayCustomerId: string | null;
    updatedAt: string;
  };
  transactions: AdminTransactionRow[];
  totals: {
    lifetimePaise: number;
    paidCount: number;
    failedCount: number;
    pendingCount: number;
    refundedCount: number;
  };
}

export async function getUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    mobile_number: string | null;
    trial_ends_at: Date;
    subscription_active_until: Date | null;
    razorpay_customer_id: string | null;
    is_admin: boolean;
    verified_at: Date | null;
    signup_ip: string | null;
    signup_user_agent: string | null;
    signup_locale: string | null;
    created_at: Date;
    updated_at: Date;
    accounts_from_same_ip: string;
  }>(
    `select u.id, u.name, u.email, u.mobile_number,
            u.trial_ends_at, u.subscription_active_until,
            u.razorpay_customer_id,
            u.is_admin, u.verified_at,
            u.signup_ip, u.signup_user_agent, u.signup_locale,
            u.created_at, u.updated_at,
            coalesce(s.cnt, 1) as accounts_from_same_ip
     from users u
     left join lateral (
       select count(*) as cnt
       from users u2
       where u2.signup_ip is not null
         and u2.signup_ip = u.signup_ip
         and u2.created_at > now() - interval '30 days'
     ) s on true
     where u.id = $1
     limit 1`,
    [userId],
  );

  const u = rows[0];
  if (!u) return null;

  const { rows: txRows } = await query<{
    id: string;
    status: string;
    plan_id: string | null;
    duration_days: number | null;
    amount_paise: number;
    currency: string;
    invoice_number: string | null;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    created_at: Date;
  }>(
    `select t.id, t.status, t.plan_id, t.duration_days, t.amount_paise, t.currency,
            t.invoice_number, t.razorpay_order_id, t.razorpay_payment_id, t.created_at
     from transactions t
     where t.user_id = $1
     order by t.created_at desc`,
    [userId],
  );

  const { rows: totalsRows } = await query<{
    lifetime: string | null;
    paid: string;
    failed: string;
    pending: string;
    refunded: string;
  }>(
    `select
       coalesce(sum(amount_paise) filter (where status = 'paid'), 0)::text as lifetime,
       count(*) filter (where status = 'paid')::text as paid,
       count(*) filter (where status = 'failed')::text as failed,
       count(*) filter (where status = 'created')::text as pending,
       count(*) filter (where status = 'refunded')::text as refunded
     from transactions
     where user_id = $1`,
    [userId],
  );
  const t = totalsRows[0];

  const now = Date.now();
  const trialEnds = u.trial_ends_at.getTime();
  const subUntil = u.subscription_active_until
    ? u.subscription_active_until.getTime()
    : 0;
  let stateLabel: AdminUserRow['state'];
  if (subUntil > now) stateLabel = 'active';
  else if (trialEnds > now) stateLabel = 'trial';
  else stateLabel = 'expired';

  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      mobileNumber: u.mobile_number,
      trialEndsAt: u.trial_ends_at.toISOString(),
      subscriptionActiveUntil: u.subscription_active_until
        ? u.subscription_active_until.toISOString()
        : null,
      isAdmin: u.is_admin,
      createdAt: u.created_at.toISOString(),
      state: stateLabel,
      verifiedAt: u.verified_at ? u.verified_at.toISOString() : null,
      signupIp: u.signup_ip,
      accountsFromSameIp: Number(u.accounts_from_same_ip ?? 1),
      signupUserAgent: u.signup_user_agent,
      signupLocale: u.signup_locale,
      razorpayCustomerId: u.razorpay_customer_id,
      updatedAt: u.updated_at.toISOString(),
    },
    transactions: txRows.map((r) => ({
      id: r.id,
      userEmail: u.email,
      userName: u.name,
      status: r.status,
      planId: r.plan_id,
      durationDays: r.duration_days,
      amountPaise: r.amount_paise,
      currency: r.currency,
      invoiceNumber: r.invoice_number,
      razorpayOrderId: r.razorpay_order_id,
      razorpayPaymentId: r.razorpay_payment_id,
      createdAt: r.created_at.toISOString(),
    })),
    totals: {
      lifetimePaise: Number(t?.lifetime ?? 0),
      paidCount: Number(t?.paid ?? 0),
      failedCount: Number(t?.failed ?? 0),
      pendingCount: Number(t?.pending ?? 0),
      refundedCount: Number(t?.refunded ?? 0),
    },
  };
}
