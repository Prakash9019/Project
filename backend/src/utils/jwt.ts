import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessClaims {
  sub: string; // userId
  phoneVerified: boolean;
  tier: string;
}

export interface RefreshClaims {
  sub: string;
  type: 'refresh';
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' } as RefreshClaims, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.jwt.accessSecret) as AccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshClaims;
}
