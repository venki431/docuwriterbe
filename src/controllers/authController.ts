import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';
import * as passwordResetService from '../services/passwordResetService';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import { computeSubscriptionStatus } from '../utils/subscription';
import { findUserById } from '../services/userService';
import { config } from '../config';
import {
  signInWithGoogle,
  verifyGoogleIdToken,
} from '../services/googleAuthService';

const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(180),
  // Indian mobile: 10 digits starting with 6-9. Accepts optional +91 / 91 / 0
  // prefixes; we normalise on the server side.
  mobileNumber: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .refine(
      (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').replace(/^(?:91|0)/, '')),
      { message: 'Enter a valid 10-digit Indian mobile number' },
    ),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({
      message: 'You must accept the Terms of Service and Privacy Policy',
    }),
  }),
  termsVersion: z.string().trim().min(1).max(40).optional(),
  // Referral code from `/signup?ref=...`. Optional, normalised server-side.
  // Length range matches the 8-char generated codes plus a little slack for
  // any future reformatting; runtime lookup tolerates whitespace/case.
  referralCode: z.string().trim().min(4).max(32).optional(),
});

function normalisePhone(raw: string): string {
  // Strip non-digits, trim a leading 91 / 0 prefix, re-prefix with +91.
  const digits = raw.replace(/\D/g, '').replace(/^(?:91|0)/, '');
  return `+91${digits}`;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

async function withSubscription<T extends object>(userId: string, extra: T) {
  const row = await findUserById(userId);
  if (!row) return extra;
  return {
    ...extra,
    subscription: computeSubscriptionStatus(
      row.trial_ends_at,
      row.subscription_active_until,
      row.verified_at,
    ),
  };
}

function clientIp(req: Request): string | null {
  // express req.ip honours `trust proxy`; fall back to the socket remote.
  const forwarded = (req.headers['x-forwarded-for'] ?? '') as string;
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export async function signup(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = signupSchema.parse(req.body);
    const result = await authService.signup({
      name: input.name,
      email: input.email,
      password: input.password,
      mobileNumber: normalisePhone(input.mobileNumber),
      termsVersion: input.termsVersion ?? '1.0.0',
      referralCode: input.referralCode?.toUpperCase() ?? null,
      signupIp: clientIp(req),
      signupUserAgent: req.get('user-agent') ?? null,
      signupLocale: req.get('accept-language')?.split(',')[0]?.trim() ?? null,
    });
    res.status(201).json(await withSubscription(result.user.id, result));
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.json(await withSubscription(result.user.id, result));
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken);
    res.json(await withSubscription(result.user.id, result));
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    await authService.logout(req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    // Deliberately uniform response — don't leak whether the email exists.
    await passwordResetService.requestPasswordReset({
      email: input.email.trim().toLowerCase(),
      requesterIp: clientIp(req),
      requesterUserAgent: req.get('user-agent') ?? null,
    });
    res.json({
      success: true,
      message:
        'If an account exists for that email, a reset link is on its way.',
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = resetPasswordSchema.parse(req.body);
    await passwordResetService.completePasswordReset({
      rawToken: input.token,
      newPassword: input.password,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ─── public auth-config (drives the frontend "Continue with Google" button) ──

export function getAuthConfig(_req: Request, res: Response): void {
  // Public on purpose — frontend reads this before login. We expose ONLY
  // the public client_id (audience) and the boolean flag. No secrets here.
  res.json({
    googleAuthEnabled: config.googleAuth.enabled,
    googleClientId: config.googleAuth.enabled
      ? config.googleAuth.clientId
      : '',
  });
}

// ─── Google sign-in ─────────────────────────────────────────────────────────

const googleSignInSchema = z.object({
  idToken: z.string().min(20).max(8192),
  referralCode: z.string().trim().min(4).max(32).optional(),
});

export async function googleSignIn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!config.googleAuth.enabled) {
      // 404 (not 400) so disabled feature looks indistinguishable from a
      // route that doesn't exist.
      throw new NotFoundError();
    }
    const input = googleSignInSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(input.idToken);
    const result = await signInWithGoogle({
      profile,
      referralCode: input.referralCode?.toUpperCase() ?? null,
      signupIp: clientIp(req),
      signupUserAgent: req.get('user-agent') ?? null,
      signupLocale: req.get('accept-language')?.split(',')[0]?.trim() ?? null,
    });
    res
      .status(result.isNewUser ? 201 : 200)
      .json(await withSubscription(result.user.id, result));
  } catch (err) {
    next(err);
  }
}
