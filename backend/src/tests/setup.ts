import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

// The suite fires hundreds of requests from a single "IP" in a few seconds,
// which would trip the production rate limits. rateLimit.test.ts re-enables
// them locally to assert the limiter actually works.
process.env.RATE_LIMIT_DISABLED = 'true';

// GEMINI_API_KEY in .env.test is a fake, non-empty placeholder (tests need
// env.gemini.apiKey truthy to reach the Gemini call path at all). Without a
// guard, any code path that isn't explicitly mocked by its own test file —
// e.g. chat.service.ts's moderation check on every text message sent —
// would otherwise call the *real* Gemini API over the network: slow,
// non-deterministic, and burns live quota. Block it by default; ai.test.ts,
// translation.test.ts, geminiClient.test.ts and moderationEval.test.ts each
// install and restore their own global.fetch mock per test, which takes
// precedence over this default for the duration of their own tests.
const blockRealFetch = (async () => {
  throw new Error('Blocked outbound fetch() in test env — mock global.fetch in this test file');
}) as typeof fetch;
global.fetch = blockRealFetch;

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
