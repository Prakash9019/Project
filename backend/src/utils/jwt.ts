import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessClaims {
  sub: string; // userId
  phoneVerified: boolean; // true for OTP-verified users (legacy)
  emailVerified: boolean;  // true for Firebase users with verified email
  tier: string;
  plan: string; // 'free' | 'premium' | 'gold' | 'platinum' — effective at token issue time
  planExpiresAt: number | null; // Unix timestamp (seconds); null for free / lifetime plans
}

export interface RefreshClaims {
  sub: string;
  type: 'refresh';
}

/** SHA-256 hash of a token for safe storage in DB. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.jwt.accessSecret, {
    expiresIn: '15m',
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' } as RefreshClaims, env.jwt.refreshSecret, {
    expiresIn: '7d',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.jwt.accessSecret) as AccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshClaims;
}
