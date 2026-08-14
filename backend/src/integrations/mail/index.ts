import { isProduction } from '@config/env';
import { logger } from '@config/logger';
import { ConsoleMailProvider } from './console.provider';
import { SmtpMailProvider } from './smtp.provider';
import type { MailProvider, MailTransportSettings } from './mail.provider';

/**
 * Con MAIL_HOST configurado -> SMTP real.
 * Sin el -> consola (solo desarrollo).
 */
export const getMailProvider = (settings: MailTransportSettings): MailProvider => {
  if (settings.host) {
    return new SmtpMailProvider(settings);
  }

  if (isProduction) {
    throw new Error('En produccion es obligatorio configurar MAIL_HOST');
  }

  logger.warn('Email: CONSOLA (configura SMTP desde el superadmin para enviar de verdad)');
  return new ConsoleMailProvider();
};

export type { MailMessage, MailProvider, MailTransportSettings } from './mail.provider';
