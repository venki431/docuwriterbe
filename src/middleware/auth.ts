import { NextFunction, Request, Response } from 'express';
import {
  ForbiddenError,
  PaymentRequiredError,
  UnauthorizedError,
} from '../utils/errors';
import { verifyAccessToken } from '../services/tokenService';
import { findUserById, rowToAuthUser } from '../services/userService';
import { computeSubscriptionStatus } from '../utils/subscription';

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }

    const row = await findUserById(payload.sub);
    if (!row) throw new UnauthorizedError('User no longer exists');

    req.user = rowToAuthUser(row);
    req.subscription = computeSubscriptionStatus(
      row.trial_ends_at,
      row.subscription_active_until,
      row.verified_at,
    );
    next();
  } catch (err) {
    next(err);
  }
}

export function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.subscription || !req.subscription.hasAccess) {
    next(
      new PaymentRequiredError(
        'Your free trial has ended. Subscribe to continue using DocGen.',
      ),
    );
    return;
  }
  next();
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.isAdmin) {
    next(new ForbiddenError('Admin access required'));
    return;
  }
  next();
}

export function requireVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.verifiedAt) {
    next(
      new ForbiddenError(
        'Please complete the one-time ₹1 account verification to continue.',
        'VERIFICATION_REQUIRED',
      ),
    );
    return;
  }
  next();
}
