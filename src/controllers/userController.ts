import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../utils/errors';
import {
  findUserById,
  rowToAuthUser,
  updateUserProfile,
} from '../services/userService';
import { computeSubscriptionStatus } from '../utils/subscription';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().max(180).optional(),
});

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const row = await findUserById(req.user.id);
    if (!row) throw new UnauthorizedError();
    res.json({
      user: rowToAuthUser(row),
      subscription: computeSubscriptionStatus(
        row.trial_ends_at,
        row.subscription_active_until,
        row.verified_at,
      ),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = updateSchema.parse(req.body);
    const row = await updateUserProfile(req.user.id, input);
    res.json({
      user: rowToAuthUser(row),
      subscription: computeSubscriptionStatus(
        row.trial_ends_at,
        row.subscription_active_until,
        row.verified_at,
      ),
    });
  } catch (err) {
    next(err);
  }
}
