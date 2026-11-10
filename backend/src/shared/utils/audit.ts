import type { Request } from 'express';
import { QueryTypes } from 'sequelize';
import { AuditLog, sequelize } from '@database/models';
import { logger } from '@config/logger';
import { auditCanonical, auditHash, auditSeverity, sanitizeAuditValue } from './auditIntegrity';

export interface AuditInput {
  actorId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  outcome?: 'SUCCESS' | 'FAILURE';
}

/**
 * RN-021: registra un cambio sensible (precio, promocion, stock, estado, reembolso).
 *
 * Nunca lanza: una falla al auditar no debe tumbar la operacion del usuario,
 * pero si queda en el log de errores para investigarla.
 */
export const audit = async (req: Request, input: AuditInput): Promise<void> => {
  try {
    const lockName = 'dulceflow.audit.chain';
    const [lock] = await sequelize.query<{ locked: number }>('SELECT GET_LOCK(:lockName, 5) AS locked', {
      replacements: { lockName },
      type: QueryTypes.SELECT,
    });
    if (Number(lock?.locked) !== 1) throw new Error('No se pudo reservar la cadena de integridad de auditoria');
    try {
        // GET_LOCK es un bloqueo de sesión; la escritura queda dentro de la sección
        // crítica para que dos peticiones concurrentes nunca compartan previousHash.
        const previous = await AuditLog.findOne({ order: [['id', 'DESC']], attributes: ['integrityHash'] });
        // MySQL DATETIME no conserva milisegundos; firmamos la misma precisión
        // que luego devuelve la lectura para que la verificación sea determinista.
        const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        const beforeJson = (sanitizeAuditValue(input.before ?? null) ?? null) as Record<string, unknown> | null;
        const afterJson = (sanitizeAuditValue(input.after ?? null) ?? null) as Record<string, unknown> | null;
        const severity = input.severity ?? auditSeverity(input.action);
        const outcome = input.outcome ?? 'SUCCESS';
        const previousHash = previous?.integrityHash ?? null;
        const canonical = auditCanonical({ previousHash, action: input.action, entity: input.entity,
          entityId: input.entityId !== undefined && input.entityId !== null ? String(input.entityId) : null,
          actorId: input.actorId ?? req.user?.sub ?? null, beforeJson, afterJson, severity, outcome,
          method: req.method ?? null, path: req.originalUrl?.slice(0, 255) ?? null,
          correlationId: req.correlationId ?? null, createdAt });
        await AuditLog.create({
          actorId: input.actorId ?? req.user?.sub ?? null,
          action: input.action,
          entity: input.entity,
          entityId: canonical.entityId as string | null,
          beforeJson,
          afterJson,
          ip: req.ip ?? null,
          userAgent: req.headers['user-agent']?.slice(0, 250) ?? null,
          correlationId: req.correlationId ?? null,
          severity,
          outcome,
          method: req.method ?? null,
          path: req.originalUrl?.slice(0, 255) ?? null,
          sessionId: req.user?.sid ?? null,
          eventVersion: 1,
          previousHash,
          integrityHash: auditHash(canonical),
          createdAt,
          updatedAt: createdAt,
        });
    } finally {
      await sequelize.query('SELECT RELEASE_LOCK(:lockName)', { replacements: { lockName } }).catch(() => undefined);
    }
  } catch (error) {
    logger.error('No se pudo escribir la auditoria', error);
  }
};
