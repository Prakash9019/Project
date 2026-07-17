import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

// ── Database cleanup ──────────────────────────────────────────

/** Truncates every app table. Room* models have no @@map so their table
 *  names are the exact (case-sensitive) model names Prisma generated. */
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "user_interactions", "add_on_purchases", "subscriptions", "credit_ledger", "credit_wallets", "feed_boosts",
    "RoomMessageDelivery", "RoomMessageReaction", "RoomMessage", "RoomMute", "RoomReport", "RoomInvite", "RoomMember", "Room",
    "messages", "conversations", "calls",
    "blocks", "reports", "mutes",
    "profile_views", "taps", "favorites",
    "album_photos", "albums",
    "private_album_grants", "private_albums", "photos",
    "verifications", "refresh_tokens", "saved_phrases", "message_templates", "city_profiles",
    "moderation_flags", "profile_prompts",
    "user_settings", "users"
    CASCADE`);
  await redis.flushdb();
}

// ── User factory ──────────────────────────────────────────────

interface CreateUserOptions {
  plan?: 'free' | 'premium' | 'gold' | 'platinum';
  planExpiresAt?: Date;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  email?: string;
  firstName?: string;
}

export async function createTestUser(opts: CreateUserOptions = {}) {
  const id = uuid();
  const plan = opts.plan ?? 'free';
  const planExpiresAt = opts.planExpiresAt ??
    (plan !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null);

  const user = await prisma.user.create({
    data: {
      id,
      email: opts.email ?? `test-${id.slice(0, 8)}@nearme.dev`,
      emailVerified: opts.emailVerified ?? true,
      phoneVerified: opts.phoneVerified ?? false,
      firstName: opts.firstName ?? 'Test',
      plan: plan as never,
      planExpiresAt,
      isOnGrid: true,
      lastActiveAt: new Date(),
      wantToSee: ['everyone'],
      whoCanDiscoverMe: ['everyone'],
      lookingFor: [],
      datingIntentions: [],
      interests: [],
      topArtists: [],
      tribes: [],
      tags: [],
      fantasyTags: [],
      whereWeCanMeet: [],
      groupsAvailable: true,
      audioCallAvailable: true,
      videoCallAvailable: true,
    },
  });

  // UserSettings row — discoverable defaults to true, sufficient for grid visibility.
  await prisma.userSettings.create({ data: { userId: id } });

  return user;
}

// ── JWT factory ───────────────────────────────────────────────

/** Builds an access token matching the real AccessClaims shape (src/utils/jwt.ts). */
export function createTestToken(
  userId: string,
  plan: 'free' | 'premium' | 'gold' | 'platinum' = 'free',
  planExpiresAt: number | null = null,
): string {
  return jwt.sign(
    { sub: userId, phoneVerified: true, emailVerified: true, tier: 'free', plan, planExpiresAt },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '1h' },
  );
}

// ── HTTP helper ───────────────────────────────────────────────

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── AddOn factory ─────────────────────────────────────────────

export async function createActiveAddOn(
  userId: string,
  addOnType: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.addOnPurchase.create({
    data: {
      userId,
      addOnType: addOnType as never,
      priceInr: 0,
      isActive: true,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      paymentProvider: 'test',
      ...extra,
    },
  });
}
