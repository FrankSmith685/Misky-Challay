import type { Request } from 'express';
import { AuditLog } from '@database/models';
import { logger } from '@config/logger';

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * RN-021: registra un cambio sensible (precio, promocion, stock, estado, reembolso).
 *
 * Nunca lanza: una falla al auditar no debe tumbar la operacion del usuario,
 * pero si queda en el log de errores para investigarla.
 */
export const audit = async (req: Request, input: AuditInput): Promise<void> => {
  try {
    await AuditLog.create({
      actorId: req.user?.sub ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId !== undefined && input.entityId !== null ? String(input.entityId) : null,
      beforeJson: input.before ?? null,
      afterJson: input.after ?? null,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 250) ?? null,
      correlationId: req.correlationId ?? null,
    });
  } catch (error) {
    logger.error('No se pudo escribir la auditoria', error);
  }
};
