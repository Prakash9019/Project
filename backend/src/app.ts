import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import timeout from 'connect-timeout';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/logger';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import { registry, httpRequestsTotal, httpRequestDuration, activeWsConnections } from './config/metrics';

import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
import gridRoutes from './modules/grid/grid.routes';
import chatRoutes from './modules/chat/chat.routes';
import messagesRoutes from './modules/chat/messages.routes';
import callsRoutes from './modules/calls/calls.routes';
import exploreRoutes from './modules/explore/explore.routes';
import discoveryRoutes from './modules/discovery/discovery.routes';
import verificationRoutes from './modules/verification/verification.routes';
import monetizationRoutes from './modules/monetization/monetization.routes';
import safetyRoutes from './modules/safety/safety.routes';
import albumsRoutes from './modules/albums/albums.routes';
import cityProfilesRoutes from './modules/city-profiles/city-profiles.routes';
import aiRoutes from './modules/ai/ai.routes';
import meRoutes from './modules/me/me.routes';
import roomsRoutes from './modules/rooms/rooms.routes';

// Re-export metrics so other modules can import from app.ts if needed
export { httpRequestsTotal, httpRequestDuration, activeWsConnections };

export function createApp(): Application {
  const app = express();

  // ── Compression (before routes) ─────────────────────────
  app.use(compression({ threshold: 1024 }));

  // ── Request timeout (before routes, after compression) ──
  app.use(timeout('30s'));
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (!req.timedout) next();
  });

  // ── Pre-auth global middleware ──────────────────────────
  app.use(requestIdMiddleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(cors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  if (!env.isProd) app.use(morgan('dev'));
  app.use(requestLogger);

  // ── Health endpoints (no auth) ──────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    const checks = { db: false, redis: false, storage: false };

    await Promise.allSettled([
      Promise.race([
        prisma.$queryRaw`SELECT 1`.then(() => { checks.db = true; }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]).catch(() => {}),
      Promise.race([
        redis.ping().then(() => { checks.redis = true; }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]).catch(() => {}),
      Promise.race([
        // R2/S3 credentials present — full connectivity verified on first upload
        Promise.resolve().then(() => {
          const { r2Configured } = require('./adapters/r2') as typeof import('./adapters/r2');
          checks.storage = r2Configured;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]).catch(() => {}),
    ]);

    const allOk = Object.values(checks).every(Boolean);
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ready' : 'degraded',
      checks,
    });
  });

  // ── Prometheus metrics ────────────────────────────────────
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  // ── Bull Board (dev/staging only) ────────────────────────
  if (process.env.NODE_ENV !== 'production' || process.env.BULL_BOARD_ENABLED === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createBullBoardRouter, bullBoardAuth } = require('./admin/bullBoard') as typeof import('./admin/bullBoard');
    app.use('/admin/queues', bullBoardAuth, createBullBoardRouter());
  }

  const v1 = '/api/v1';
  app.use(`${v1}/auth`, authRoutes);
  app.use(`${v1}`, profileRoutes);
  app.use(`${v1}/grid`, gridRoutes);
  app.use(`${v1}/conversations`, chatRoutes);
  app.use(`${v1}/messages`, messagesRoutes);
  app.use(`${v1}/calls`, callsRoutes);
  app.use(`${v1}/explore`, exploreRoutes);
  app.use(`${v1}/discovery`, discoveryRoutes);
  app.use(`${v1}/verification`, verificationRoutes);
  app.use(`${v1}/billing`, monetizationRoutes);
  app.use(`${v1}/safety`, safetyRoutes);

  // Change 7: album feature (also accessible via /api/users/:userId/albums in profile routes)
  app.use('/api/albums', albumsRoutes);

  app.use(`${v1}/city-profiles`, cityProfilesRoutes);
  app.use(`${v1}/ai`, aiRoutes);
  app.use(`${v1}/me`, meRoutes);

  // Dating Rooms (Groups) — spec mounts these at /api/rooms
  app.use('/api/rooms', roomsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
