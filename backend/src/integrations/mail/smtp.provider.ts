import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@config/env';
import type { MailMessage, MailProvider } from './mail.provider';

/**
 * SMTP real (Gmail, SendGrid, Resend, Mailgun... todos hablan SMTP).
 * Se activa en cuanto MAIL_HOST tiene valor.
 */
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';
  readonly isLive = true;

  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_PORT === 465,
      auth:
        env.MAIL_USER && env.MAIL_PASSWORD
          ? { user: env.MAIL_USER, pass: env.MAIL_PASSWORD }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { messageId: info.messageId };
  }
}
