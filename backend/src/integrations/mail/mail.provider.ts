/**
 * CONTRATO DEL PROVEEDOR DE EMAIL
 * ---------------------------------------------------------------------------
 * Igual que con los pagos: el dominio NO conoce a Gmail, SendGrid ni Resend.
 * Solo conoce esta interfaz. Cambiar de proveedor = otro adaptador.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransportSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
}

export interface MailProvider {
  readonly name: string;
  /** true cuando hay un proveedor real configurado (no la consola). */
  readonly isLive: boolean;

  send(message: MailMessage): Promise<{ messageId: string }>;
}
