import http from 'http';
import { createApp } from './app';
import { initSocket } from './realtime/socket';
import { env, validateEnv } from './config/env';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import { startProcessors } from './jobs/processors';
import { allQueues } from './jobs/queue';

// Validate all required env vars before anything else runs
validateEnv();

// ── Unhandled error sentinels ─────────────────────────────
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'uncaught_exception', error: err.message, stack: err.stack }));
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'unhandled_rejection', reason: String(reason) }));
});

async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);
  startProcessors(); // register Bull job processors (call watchdog, daily reset, scheduled calls)

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on :${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received — shutting down gracefully`);
    server.close();
    io.close();
    // Give in-flight requests up to 30s to finish
    await new Promise<void>(resolve => setTimeout(resolve, 30_000));
    // Close Bull queues
    try {
      await Promise.all(allQueues.map((q) => q.close()));
    } catch { /* ignore */ }
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
