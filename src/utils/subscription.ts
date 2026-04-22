import { SubscriptionStatus } from '../types/auth';

export function computeSubscriptionStatus(
  trialEndsAt: Date,
  subscriptionActiveUntil: Date | null,
  verifiedAt: Date | null = null,
): SubscriptionStatus {
  const now = Date.now();
  const trialMs = trialEndsAt.getTime();
  const subMs = subscriptionActiveUntil ? subscriptionActiveUntil.getTime() : 0;

  const hasActiveSub = subMs > now;
  const inTrial = trialMs > now;
  const accessUntilMs = Math.max(trialMs, subMs);

  let state: SubscriptionStatus['state'];
  if (hasActiveSub) state = 'active';
  else if (inTrial) state = 'trial';
  else state = 'expired';

  const daysLeft = Math.max(
    0,
    Math.ceil((accessUntilMs - now) / (1000 * 60 * 60 * 24)),
  );

  return {
    state,
    trialEndsAt: trialEndsAt.toISOString(),
    subscriptionActiveUntil: subscriptionActiveUntil
      ? subscriptionActiveUntil.toISOString()
      : null,
    accessUntil: new Date(accessUntilMs).toISOString(),
    daysLeft,
    hasAccess: state !== 'expired',
    isVerified: !!verifiedAt,
  };
}
