import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError } from '@shared/errors/ApiError';
import { logger } from '@config/logger';
import { isProduction } from '@config/env';

/** Convierte cualquier excepcion en la respuesta estandar { success:false, ... } */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let status = 500;
  let message = 'Error interno del servidor';
  let code = 'INTERNAL_ERROR';
  let details: unknown;

  if (error instanceof ApiError) {
    status = error.statusCode;
    message = error.message;
    code = error.code;
    details = error.details;
  } else if (error instanceof ZodError) {
    status = 400;
    const firstField = error.issues[0]?.path.at(-1);
    message = firstField ? `Revisa el campo "${String(firstField)}"` : 'Revisa los datos enviados';
    code = 'VALIDATION_ERROR';
    details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof UniqueConstraintError) {
    status = 409;
    message = 'El registro ya existe';
    code = 'DUPLICATED';
    details = error.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (error instanceof ValidationError) {
    status = 400;
    message = error.errors[0]?.path
      ? `Revisa el campo "${error.errors[0].path}"`
      : 'Revisa los datos enviados';
    code = 'VALIDATION_ERROR';
    details = error.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (error instanceof BaseError) {
    status = 500;
    message = 'Error de base de datos';
    code = 'DATABASE_ERROR';
  } else if (error instanceof Error) {
    message = isProduction ? 'Error interno del servidor' : error.message;
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}`, error);
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(details ? { details } : {}),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
};
