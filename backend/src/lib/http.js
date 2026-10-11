// Shared helpers: validation, error type, and the standard response shape.
// Success -> { data }   Error -> { error: { code, message, fields? } }
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const bad = (message, code = 'BAD_REQUEST') => new ApiError(400, code, message);
export const notFound = (what) => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message) => new ApiError(409, 'CONFLICT', message);

export const validate = (schema, source = 'body') => (req, _res, next) => {
  req[source] = schema.parse(req[source]); // ZodError handled in errorHandler
  next();
};

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message]));
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Check the highlighted fields', fields } });
  }
  if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT'))
    return res.status(409).json({ error: { code: 'CONSTRAINT', message: err.message } });
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong on the server' } });
};
