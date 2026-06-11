import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import basicAuth from 'basic-auth';
import type { Request, Response, NextFunction } from 'express';
import {
  callWatchdogQueue,
  scheduledCallQueue,
  dailyResetQueue,
  subscriptionExpiryQueue,
} from '../jobs/queue';

export function createBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullAdapter(callWatchdogQueue),
      new BullAdapter(scheduledCallQueue),
      new BullAdapter(dailyResetQueue),
      new BullAdapter(subscriptionExpiryQueue),
    ],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}

export function bullBoardAuth(req: Request, res: Response, next: NextFunction) {
  const user = basicAuth(req);
  const adminUser = process.env.BULL_BOARD_USER ?? 'admin';
  const adminPass = process.env.BULL_BOARD_PASS ?? 'admin';
  if (!user || user.name !== adminUser || user.pass !== adminPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    return res.status(401).send('Unauthorized');
  }
  next();
}
