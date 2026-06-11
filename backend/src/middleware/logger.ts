import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration } from '../config/metrics';

/** Log level: 'debug' < 'info' < 'warn' < 'error'. Defaults to 'info'. */
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();

function shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
  const levels = ['debug', 'info', 'warn', 'error'];
  return levels.indexOf(level) >= levels.indexOf(LOG_LEVEL);
}

/** Mask a phone number for safe logging: keeps first 3 and last 4 digits. */
export function maskPhone(phone: string): string {
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * Structured request logger.
 * Logs { requestId, userId, method, path, statusCode, durationMs, plan }
 * on every response finish event.
 * Also records Prometheus http_requests_total and http_request_duration_seconds.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();
  const timerEnd = httpRequestDuration.startTimer({ method: req.method, path: req.path });

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;

    // Prometheus counters
    httpRequestsTotal.inc({ method: req.method, path: req.path, status: String(res.statusCode) });
    timerEnd();

    if (shouldLog('info')) {
      const entry = {
        requestId:  req.requestId,
        userId:     req.user?.sub ?? null,
        method:     req.method,
        path:       req.path,
        statusCode: res.statusCode,
        durationMs,
        plan:       req.user?.plan ?? null,
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  });

  next();
}

/** Log a structured auth/application event at INFO level. */
export function logEvent(event: Record<string, unknown>): void {
  if (shouldLog('info')) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(event));
  }
}
