export interface AuthUser {
  id: string;
  email: string;
  name: string;
  trialEndsAt: string;
  subscriptionActiveUntil: string | null;
  isAdmin: boolean;
  verifiedAt: string | null;
  mobileNumber: string | null;
}

export interface SubscriptionStatus {
  state: 'trial' | 'active' | 'expired';
  trialEndsAt: string;
  subscriptionActiveUntil: string | null;
  accessUntil: string; // whichever is later — the effective "paid through"
  daysLeft: number;
  hasAccess: boolean;
  isVerified: boolean;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  typ: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      subscription?: SubscriptionStatus;
    }
  }
}
