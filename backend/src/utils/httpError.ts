export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required') => new HttpError(401, 'unauthorized', msg),
  forbidden: (msg = 'Forbidden') => new HttpError(403, 'forbidden', msg),
  notFound: (msg = 'Not found') => new HttpError(404, 'not_found', msg),
  conflict: (msg = 'Conflict') => new HttpError(409, 'conflict', msg),
  validation: (msg = 'Validation failed', details?: unknown) =>
    new HttpError(422, 'validation_error', msg, details),
  rateLimited: (msg = 'Rate limit exceeded') => new HttpError(429, 'rate_limited', msg),
  badRequest: (msg = 'Bad request') => new HttpError(400, 'bad_request', msg),
  paymentRequired: (msg = 'Upgrade or purchase required') =>
    new HttpError(402, 'payment_required', msg),
};
