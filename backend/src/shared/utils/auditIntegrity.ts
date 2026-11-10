import { createHmac } from 'node:crypto';
import { env } from '@config/env';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_STRING = 4_000;
const SECRET_KEY = /password|secret|token|authorization|api.?key|private.?key|mfa|cvv|cvc|card.?number|smtp.?password|encryption/i;
const PII_KEY = /^(email|phone|telephone|doc(number|ument)?|dni|passport|address|postal|ip)$/i;

const maskValue = (value: string, key: string): string => {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (!PII_KEY.test(key)) return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 1)}***@${domain ?? '***'}`;
  }
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

/** Sanitiza en el borde de escritura para que los secretos nunca lleguen al JSON de auditoría. */
export const sanitizeAuditValue = (value: unknown, key = '', depth = 0): unknown => {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return maskValue(value, key);
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, key, depth + 1));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).slice(0, 200).map(([childKey, childValue]) => [childKey, sanitizeAuditValue(childValue, childKey, depth + 1)]));
  }
  return String(value);
};

export const auditSeverity = (action: string): 'INFO' | 'WARNING' | 'CRITICAL' => {
  if (/(superadmin|role\.|permission|refund|payment|delete_permanent|export|retention|password|mfa|login\.failed|access\.denied)/i.test(action)) return 'CRITICAL';
  if (/(status|archive|publish|price|cancel|reopen|escalat|settings|bulk|failed)/i.test(action)) return 'WARNING';
  return 'INFO';
};

export const auditHash = (input: Record<string, unknown>): string => {
  const payload = JSON.stringify(input);
  return createHmac('sha256', env.AUDIT_SIGNING_SECRET ?? env.JWT_REFRESH_SECRET).update(payload).digest('hex');
};

export const auditCanonical = (input: {
  previousHash: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: number | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  severity: string;
  outcome: string;
  method: string | null;
  path: string | null;
  correlationId: string | null;
  createdAt: Date;
}): Record<string, unknown> => ({
  previousHash: input.previousHash,
  action: input.action,
  entity: input.entity,
  entityId: input.entityId,
  actorId: input.actorId,
  beforeJson: input.beforeJson,
  afterJson: input.afterJson,
  severity: input.severity,
  outcome: input.outcome,
  method: input.method,
  path: input.path,
  correlationId: input.correlationId,
  createdAt: input.createdAt.toISOString(),
});
