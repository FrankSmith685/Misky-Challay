import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError } from '@shared/errors/ApiError';
import { logger } from '@config/logger';
import { isProduction } from '@config/env';

/**
 * Que decirle al cliente segun QUE dato esta repetido.
 *
 * Un choque de unicidad respondia siempre "El registro ya existe". En un
 * formulario de registro con un email nuevo pero un telefono ya usado, eso se lee
 * como un fallo del sistema: el dato que el cliente ve en pantalla no existe, y
 * el que sobra no se nombra. Los servicios deberian anticiparse a estos casos,
 * pero cuando alguno se escapa la respuesta tiene que seguir siendo util.
 */
const DUPLICATE_MESSAGES: Record<string, string> = {
  email: 'Ese email ya esta registrado',
  phone: 'Ese telefono ya esta registrado en otra cuenta',
  slug: 'Ya existe un registro con ese identificador',
  code: 'Ya existe un registro con ese codigo',
};

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
    code = 'DUPLICATED';
    details = error.errors.map((e) => ({ field: e.path, message: e.message }));

    const field = error.errors.find((e) => typeof e.path === 'string' && e.path)?.path;
    message = field
      ? (DUPLICATE_MESSAGES[field] ?? `Ya existe un registro con ese ${field}`)
      : 'El registro ya existe';
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
  } else if (status === 403) {
    // El 403 dejo de nombrar el permiso en pantalla (era jerga interna y publicaba
    // el mapa de permisos). Si tampoco quedara aqui, un "no me deja" del operario
    // seria indiagnosticable: el codigo exacto vive en el log, no en la respuesta.
    logger.warn(`403 ${req.method} ${req.originalUrl} usuario=${req.user?.sub ?? 'anonimo'}`, details);
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
