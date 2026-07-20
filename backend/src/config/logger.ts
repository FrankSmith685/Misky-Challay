import { isProduction } from './env';

type Level = 'info' | 'warn' | 'error' | 'debug' | 'success';

const COLORS: Record<Level | 'reset' | 'dim', string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[35m',
  success: '\x1b[32m',
  dim: '\x1b[90m',
  reset: '\x1b[0m',
};

/**
 * JSON.stringify(new Error()) devuelve "{}": name, message y stack no son enumerables.
 * Sin esto, en produccion todos los 500 y los fallos de job se registran vacios.
 */
const serializeMeta = (meta: unknown): unknown => {
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
      ...(meta.cause !== undefined ? { cause: serializeMeta(meta.cause) } : {}),
    };
  }
  if (Array.isArray(meta)) return meta.map(serializeMeta);
  if (meta && typeof meta === 'object') {
    return Object.fromEntries(
      Object.entries(meta as Record<string, unknown>).map(([key, value]) => [
        key,
        serializeMeta(value),
      ]),
    );
  }
  return meta;
};

const write = (level: Level, message: string, meta?: unknown): void => {
  const time = new Date().toISOString();
  const label = level.toUpperCase().padEnd(7);

  if (isProduction) {
    // En produccion: log estructurado para agregadores (correlation_id se agrega luego).
    const line = JSON.stringify({ time, level, message, meta: serializeMeta(meta) });
    if (level === 'error') console.error(line);
    else console.log(line);
    return;
  }

  const prefix = `${COLORS.dim}${time}${COLORS.reset} ${COLORS[level]}${label}${COLORS.reset}`;
  if (level === 'error') console.error(prefix, message, meta ?? '');
  else console.log(prefix, message, meta ?? '');
};

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  success: (message: string, meta?: unknown) => write('success', message, meta),
};
