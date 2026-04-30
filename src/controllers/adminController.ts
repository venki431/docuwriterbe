import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAdminStats,
  getUserDetail,
  listRecentTransactions,
  listRecentUsers,
  listTransactions,
  listUsers,
  type TransactionStatusFilter,
  type UserStateFilter,
} from '../services/adminService';
import { NotFoundError } from '../utils/errors';

export async function overview(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [stats, users, transactions] = await Promise.all([
      getAdminStats(),
      listRecentUsers(20),
      listRecentTransactions(20),
    ]);
    res.json({
      stats,
      users,
      transactions,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

const listUsersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  state: z
    .enum(['all', 'trial', 'active', 'expired', 'unverified', 'admin'])
    .optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function users(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = listUsersSchema.parse(req.query);
    const result = await listUsers({
      q: input.q ?? null,
      state: (input.state as UserStateFilter | undefined) ?? 'all',
      page: input.page,
      pageSize: input.pageSize,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

const listTransactionsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'created', 'paid', 'failed', 'refunded']).optional(),
  planId: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function transactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = listTransactionsSchema.parse(req.query);
    const result = await listTransactions({
      q: input.q ?? null,
      status: (input.status as TransactionStatusFilter | undefined) ?? 'all',
      planId: input.planId ?? null,
      page: input.page,
      pageSize: input.pageSize,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

const userIdSchema = z.object({ id: z.string().uuid() });

export async function userDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = userIdSchema.parse(req.params);
    const detail = await getUserDetail(id);
    if (!detail) throw new NotFoundError('User not found');
    res.json(detail);
  } catch (err) {
    next(err);
  }
}
