import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

// The suite fires hundreds of requests from a single "IP" in a few seconds,
// which would trip the production rate limits. rateLimit.test.ts re-enables
// them locally to assert the limiter actually works.
process.env.RATE_LIMIT_DISABLED = 'true';

// Confirm we are talking to the TEST database, not production
beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    throw new Error(
      '⛔ DATABASE_URL does not look like a test database.\n' +
      'Set DATABASE_URL in .env.test to a local test DB.\n' +
      'Current: ' + dbUrl.slice(0, 40) + '...',
    );
  }
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
