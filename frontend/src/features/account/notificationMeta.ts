import type { AccountNotification } from './services/account.service';

export type NotificationCategory = 'ORDER' | 'PAYMENT' | 'PLAN' | 'COMPLAINT' | 'AVAILABILITY' | 'SECURITY' | 'OTHER';

export const notificationCategory = (item: Pick<AccountNotification, 'template' | 'subject'>): NotificationCategory => {
  const template = item.template.toUpperCase();
  const subject = item.subject.toUpperCase();
  if (template.includes('PASSWORD') || template.includes('SECURITY') || subject.includes('SEGURIDAD')) return 'SECURITY';
  if (template.startsWith('COMPLAINT_') || template.includes('RECLAM')) return 'COMPLAINT';
  if (template.includes('PAYMENT') || subject.includes('PAGO')) return 'PAYMENT';
  if (template.includes('PLAN') || subject.includes('SALDO') || subject.includes('PLAN')) return 'PLAN';
  if (template.includes('PRODUCT_AVAILABLE') || subject.includes('DISPONIBLE')) return 'AVAILABILITY';
  if (template.startsWith('ORDER_') || subject.includes('PEDIDO')) return 'ORDER';
  return 'OTHER';
};

export const notificationCategoryLabel: Record<NotificationCategory, string> = {
  ORDER: 'Pedidos',
  PAYMENT: 'Pagos',
  PLAN: 'Planes y saldo',
  COMPLAINT: 'Reclamos',
  AVAILABILITY: 'Disponibilidad',
  SECURITY: 'Seguridad',
  OTHER: 'Otros',
};

export const notificationCategoryTone: Record<NotificationCategory, string> = {
  ORDER: 'bg-brand-50 text-brand-700',
  PAYMENT: 'bg-accent-50 text-accent-800',
  PLAN: 'bg-tertiary-50 text-tertiary-700',
  COMPLAINT: 'bg-tertiary-50 text-tertiary-700',
  AVAILABILITY: 'bg-brand-50 text-brand-700',
  SECURITY: 'bg-accent-50 text-accent-800',
  OTHER: 'bg-surface-muted text-ink-muted',
};
