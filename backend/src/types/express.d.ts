import type { TokenPayload } from '@shared/utils/jwt';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado, inyectado por authenticate() */
      user?: TokenPayload;
      /** Identificador de la peticion para trazabilidad en logs */
      correlationId?: string;
    }
  }
}

export {};
