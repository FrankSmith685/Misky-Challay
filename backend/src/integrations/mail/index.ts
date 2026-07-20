import { env, isProduction } from '@config/env';
import { logger } from '@config/logger';
import { ConsoleMailProvider } from './console.provider';
import { SmtpMailProvider } from './smtp.provider';
import type { MailProvider } from './mail.provider';

let provider: MailProvider | null = null;

/**
 * Con MAIL_HOST configurado -> SMTP real.
 * Sin el -> consola (solo desarrollo).
 */
export const getMailProvider = (): MailProvider => {
  if (provider) return provider;

  if (env.MAIL_HOST) {
    provider = new SmtpMailProvider();
    logger.success(`Email: SMTP (${env.MAIL_HOST})`);
    return provider;
  }

  if (isProduction) {
    throw new Error('En produccion es obligatorio configurar MAIL_HOST');
  }

  provider = new ConsoleMailProvider();
  logger.warn('Email: CONSOLA (define MAIL_HOST para enviar de verdad)');
  return provider;
};

export type { MailMessage, MailProvider } from './mail.provider';
