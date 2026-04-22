import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db/pool';
import { JwtAccessPayload, JwtRefreshPayload } from '../types/auth';

export function signAccessToken(userId: string, email: string): string {
  const payload: JwtAccessPayload = { sub: userId, email, typ: 'access' };
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as SignOptions);
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: JwtRefreshPayload = { sub: userId, jti, typ: 'refresh' };
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, config.jwt.accessSecret) as JwtAccessPayload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as JwtRefreshPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDurationToMs(dur: string): number {
  const m = /^(\d+)([smhd])$/.exec(dur);
  if (!m) throw new Error(`Invalid duration: ${dur}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}

export async function persistRefreshToken(
  userId: string,
  jti: string,
  rawToken: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + parseDurationToMs(config.jwt.refreshExpiresIn));
  await query(
    `insert into refresh_tokens (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [jti, userId, hashToken(rawToken), expiresAt],
  );
}

export async function consumeRefreshToken(
  jti: string,
  rawToken: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `update refresh_tokens
     set revoked_at = now()
     where id = $1 and token_hash = $2 and revoked_at is null and expires_at > now()
     returning id`,
    [jti, hashToken(rawToken)],
  );
  return rows.length > 0;
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    `update refresh_tokens set revoked_at = now()
     where user_id = $1 and revoked_at is null`,
    [userId],
  );
}
