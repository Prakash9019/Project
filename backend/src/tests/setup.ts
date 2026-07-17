import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

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
