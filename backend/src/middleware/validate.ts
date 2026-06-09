import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { Errors } from '../utils/httpError';

type Source = 'body' | 'query' | 'params';

/** Validate & coerce a request part with a Zod schema; replaces it with the parsed value. */
export const validate =
  (schema: ZodSchema, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        Errors.validation(
          'Request validation failed',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[source] = result.data;
    next();
  };
