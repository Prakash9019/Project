import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.isProd ? ['error'] : ['warn', 'error'],
});

// Slow query logging: warn on any query > 500ms
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  if (duration > 500) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      event: 'slow_query',
      model: params.model,
      action: params.action,
      durationMs: duration,
    }));
  }
  return result;
});
