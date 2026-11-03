import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider, MailTransportSettings } from './mail.provider';

/**
 * SMTP real (Gmail, SendGrid, Resend, Mailgun... todos hablan SMTP).
 * Se activa en cuanto MAIL_HOST tiene valor.
 */
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';
  readonly isLive = true;

  private readonly transporter: Transporter;
  private readonly settings: MailTransportSettings;

  constructor(settings: MailTransportSettings) {
    this.settings = settings;
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth:
        settings.user && settings.password
          ? { user: settings.user, pass: settings.password }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: `${this.settings.fromName} <${this.settings.fromEmail}>`,
      replyTo: this.settings.replyToEmail || undefined,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { messageId: info.messageId };
  }
}
