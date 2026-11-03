/**
 * CONTRATO DEL PROVEEDOR DE PAGO
 * ---------------------------------------------------------------------------
 * El resto del sistema (checkout, pedidos, reembolsos) SOLO conoce esta interfaz.
 * Cambiar de Stripe a otra pasarela = escribir otro adaptador, no tocar el dominio.
 */

export interface CreateCheckoutInput {
  orderId: number;
  orderNumber: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  description: string;
  /** Nombre visible en el checkout alojado. */
  displayName?: string;
  /** Clave de idempotencia: repetirla no debe crear un segundo cobro (RN-015). */
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  /** Id de la sesión u order creada por la pasarela. */
  providerReference: string;
  /** URL a la que se envia al cliente para pagar. */
  checkoutUrl: string;
  /** Respuesta depurada: nunca datos sensibles de tarjeta. */
  safeResponse: Record<string, unknown>;
}

export type WebhookOutcome =
  | { kind: 'PAID'; eventId: string; eventType: string; providerReference: string; method?: string; amount?: number; currency?: string }
  | {
      kind: 'FAILED';
      eventId: string;
      eventType: string;
      providerReference: string;
      reason?: string;
    }
  | { kind: 'IGNORED'; eventId: string; eventType: string };

export interface RefundInput {
  providerReference: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

export interface WebhookContext {
  requestId?: string;
  resourceId?: string;
}

export interface RefundResult {
  providerReference: string;
  succeeded: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  /** true cuando el proveedor real esta configurado con sus claves. */
  readonly isLive: boolean;

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  /**
   * Verifica la firma del webhook con el body CRUDO y traduce el evento del
   * proveedor a un resultado del dominio. Si la firma no valida, lanza.
   */
  parseWebhook(rawBody: Buffer, signature: string | undefined, context?: WebhookContext): WebhookOutcome | Promise<WebhookOutcome>;

  /** Consulta autenticada al proveedor para recuperar una confirmacion cuyo webhook no llego. */
  lookupCheckout?(providerReference: string): Promise<WebhookOutcome>;

  refund(input: RefundInput): Promise<RefundResult>;
}
