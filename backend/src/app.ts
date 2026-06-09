import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
import gridRoutes from './modules/grid/grid.routes';
import chatRoutes from './modules/chat/chat.routes';
import callsRoutes from './modules/calls/calls.routes';
import exploreRoutes from './modules/explore/explore.routes';
import discoveryRoutes from './modules/discovery/discovery.routes';
import verificationRoutes from './modules/verification/verification.routes';
import monetizationRoutes from './modules/monetization/monetization.routes';
import safetyRoutes from './modules/safety/safety.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '512kb' }));
  if (!env.isProd) app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const v1 = '/api/v1';
  app.use(`${v1}/auth`, authRoutes);
  app.use(`${v1}`, profileRoutes);               // /me, /me/photos, /me/prompts, /me/pin, /catalogs, /users/:id
  app.use(`${v1}/grid`, gridRoutes);
  app.use(`${v1}/conversations`, chatRoutes);
  app.use(`${v1}/calls`, callsRoutes);
  app.use(`${v1}/explore`, exploreRoutes);
  app.use(`${v1}/discovery`, discoveryRoutes);
  app.use(`${v1}/verification`, verificationRoutes);
  app.use(`${v1}/billing`, monetizationRoutes);
  app.use(`${v1}/safety`, safetyRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
