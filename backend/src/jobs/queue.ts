import Bull from 'bull';
import { env } from '../config/env';

export const callWatchdogQueue      = new Bull<CallWatchdogJob>('call-watchdog', env.redisUrl);
export const scheduledCallQueue     = new Bull<ScheduledCallJob>('scheduled-calls', env.redisUrl);
export const dailyResetQueue        = new Bull<Record<string, never>>('daily-reset', env.redisUrl);
export const subscriptionExpiryQueue = new Bull<Record<string, never>>('subscription-expiry', env.redisUrl);

export interface CallWatchdogJob {
  callId: string;
  callerId: string;
  calleeId: string;
  type: 'audio' | 'video';
}

export interface ScheduledCallJob {
  callId: string;
  callerId: string;
  calleeId: string;
  type: 'audio' | 'video';
}

/** All queues — used by graceful shutdown and Bull Board. */
export const allQueues = [callWatchdogQueue, scheduledCallQueue, dailyResetQueue, subscriptionExpiryQueue];

// Register repeatable cron jobs (fire-and-forget on startup)
dailyResetQueue.add({}, {
  repeat: { cron: '0 0 * * *' },
  jobId: 'daily-reset-singleton',
}).catch(() => {});

// 01:00 UTC — expire plans and deactivate subscriptions
subscriptionExpiryQueue.add({}, {
  repeat: { cron: '0 1 * * *' },
  jobId: 'subscription-expiry-singleton',
}).catch(() => {});
