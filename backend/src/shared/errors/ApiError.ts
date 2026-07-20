/** Error de negocio/HTTP controlado. El error handler lo convierte en respuesta JSON. */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Solicitud invalida', details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'No autenticado'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'No autorizado'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Recurso no encontrado'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message = 'Conflicto con el estado actual', details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static unprocessable(message = 'Regla de negocio no cumplida', details?: unknown): ApiError {
    return new ApiError(422, message, 'UNPROCESSABLE_ENTITY', details);
  }

  static tooManyRequests(message = 'Demasiadas solicitudes'): ApiError {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS');
  }

  static internal(message = 'Error interno del servidor', details?: unknown): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR', details);
  }
}
