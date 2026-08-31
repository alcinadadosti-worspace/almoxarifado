import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'Autenticação necessária.') {
    return new HttpError(401, message, 'unauthorized');
  }
  static forbidden(message = 'Acesso negado.') {
    return new HttpError(403, message, 'forbidden');
  }
  static notFound(message = 'Registro não encontrado.') {
    return new HttpError(404, message, 'not_found');
  }
  static conflict(message: string, code = 'conflict') {
    return new HttpError(409, message, code);
  }
  static gone(message: string, code = 'gone') {
    return new HttpError(410, message, code);
  }
}

/** Achata os erros do zod em `{ campo: mensagem }` para a UI. */
export function zodDetails(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos.',
      code: 'validation_error',
      details: zodDetails(error),
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }
  console.error('[api] erro não tratado', error);
  res.status(500).json({ error: 'Erro interno do servidor.', code: 'internal_error' });
}

/** Envolve handlers async para que rejeições cheguem ao errorHandler. */
export function asyncRoute<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req as T, res, next).catch(next);
  };
}
