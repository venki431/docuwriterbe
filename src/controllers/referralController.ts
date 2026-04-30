import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  applyReferralCode,
  getReferralLink,
  getReferralStatus,
} from '../services/referralService';
import { UnauthorizedError } from '../utils/errors';

export async function link(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const out = await getReferralLink(req.user.id);
    res.json(out);
  } catch (err) {
    next(err);
  }
}

export async function status(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const out = await getReferralStatus(req.user.id);
    res.json(out);
  } catch (err) {
    next(err);
  }
}

const applySchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export async function apply(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const input = applySchema.parse(req.body);
    const out = await applyReferralCode({
      userId: req.user.id,
      code: input.code,
    });
    res.json({ success: true, ...out });
  } catch (err) {
    next(err);
  }
}
