import { NextFunction, Request, Response } from 'express';
import {
  getAdminStats,
  listRecentTransactions,
  listRecentUsers,
} from '../services/adminService';

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
