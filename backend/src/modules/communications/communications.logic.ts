import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MessagingConfig } from './communications.config';

export const validWebhookSignature = (
  body: Buffer,
  signature: string | undefined,
  secret: string,
): boolean => {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature.slice(7), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export const withinServiceWindow = (
  lastInboundAt: Date | string | null | undefined,
  now = Date.now(),
): boolean => {
  if (!lastInboundAt) return false;
  const elapsed = now - new Date(lastInboundAt).getTime();
  return elapsed >= 0 && elapsed < 24 * 3600000;
};
export const withinOpeningHours = (config: MessagingConfig, now = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  const time = `${value('hour')}:${value('minute')}`;
  if (config.openingTime <= config.closingTime)
    return (
      config.workingDays.includes(day) && time >= config.openingTime && time < config.closingTime
    );
  return (
    (config.workingDays.includes(day) && time >= config.openingTime) ||
    (config.workingDays.includes((day + 6) % 7) && time < config.closingTime)
  );
};
export const monotonicDeliveryState = (current: string, incoming: string): string => {
  const ranks: Record<string, number> = {
    QUEUED: 0,
    PROCESSING: 1,
    UNKNOWN: 1,
    FAILED: 1,
    BLOCKED: 1,
    ACCEPTED: 2,
    DELIVERED: 3,
    READ: 4,
  };
  if (['SIMULATED', 'SKIPPED'].includes(current)) return current;
  if (current === 'FAILED' && incoming === 'ACCEPTED') return current;
  if (incoming === 'FAILED' && !['DELIVERED', 'READ'].includes(current)) return 'FAILED';
  return (ranks[incoming] ?? -1) > (ranks[current] ?? -1) ? incoming : current;
};
export const botMenu = (welcome: string): string =>
  `${welcome}\n\n1. Consultar mi pedido\n2. Cómo pagar con Yape o Plin\n3. Horarios y delivery\n4. Hablar con una persona\n\nEscribe el número de una opción. Escribe BAJA para desactivar avisos o ALTA para permitirlos de nuevo.`;
export const escapeMessageHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ??
      character,
  );
