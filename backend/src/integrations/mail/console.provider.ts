import crypto from 'node:crypto';
import { logger } from '@config/logger';
import type { MailMessage, MailProvider } from './mail.provider';

/**
 * Proveedor de desarrollo: imprime el correo en la consola en vez de enviarlo.
 *
 * Asi puedes ver EXACTAMENTE que recibiria el cliente sin configurar nada ni
 * mandarle correos de prueba a nadie. En produccion esta prohibido (index.ts).
 */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';
  readonly isLive = false;

  async send(message: MailMessage): Promise<{ messageId: string }> {
    logger.info(
      `EMAIL (no enviado, solo desarrollo)\n  Para: ${message.to}\n  Asunto: ${message.subject}\n  ${message.text.split('\n').join('\n  ')}`,
    );

    return { messageId: `console_${crypto.randomUUID()}` };
  }
}
