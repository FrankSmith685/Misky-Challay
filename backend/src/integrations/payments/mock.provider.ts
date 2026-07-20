import crypto from 'node:crypto';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookOutcome,
} from './payment.provider';

/**
 * SIMULADOR DE PAGO (solo desarrollo)
 * ---------------------------------------------------------------------------
 * Se usa cuando no hay STRIPE_SECRET_KEY. Reproduce el MISMO ciclo que Stripe:
 * crea una "sesion", envia al cliente a una pagina de pago y confirma el pedido
 * unicamente por un webhook FIRMADO. Asi el flujo real ya esta probado el dia
 * que se enchufan las claves de Stripe.
 *
 * Firma: HMAC-SHA256 del body crudo con MOCK_WEBHOOK_SECRET, en x-mock-signature.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isLive = false;

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const providerReference = `mock_cs_${crypto.randomUUID()}`;

    return {
      providerReference,
      checkoutUrl: `${env.FRONTEND_URL}/checkout/simulador?ref=${providerReference}&total=${input.amount}&pedido=${input.orderNumber}`,
      safeResponse: { id: providerReference, amount: input.amount, currency: input.currency },
    };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome {
    if (!signature) throw ApiError.badRequest('Falta la firma del webhook');

    const expected = crypto
      .createHmac('sha256', env.MOCK_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const received = Buffer.from(signature);
    const computed = Buffer.from(expected);

    if (received.length !== computed.length || !crypto.timingSafeEqual(received, computed)) {
      throw ApiError.unauthorized('Firma del webhook invalida');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      providerReference: string;
      reason?: string;
    };

    if (event.type === 'payment.succeeded') {
      return {
        kind: 'PAID',
        eventId: event.id,
        eventType: event.type,
        providerReference: event.providerReference,
        method: 'card',
      };
    }

    if (event.type === 'payment.failed') {
      return {
        kind: 'FAILED',
        eventId: event.id,
        eventType: event.type,
        providerReference: event.providerReference,
        reason: event.reason ?? 'El pago fue rechazado',
      };
    }

    return { kind: 'IGNORED', eventId: event.id, eventType: event.type };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return { providerReference: `mock_re_${crypto.randomUUID()}`, succeeded: true };
  }
}
