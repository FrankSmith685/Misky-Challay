import Stripe from 'stripe';
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
 * Adaptador de Stripe (Checkout Session alojado).
 *
 * Por que Checkout Session y no Elements: el cliente paga en la pagina de Stripe,
 * asi ningun dato de tarjeta toca nuestro servidor ni nuestro frontend.
 *
 * Eventos que confirman el pedido:
 *   checkout.session.completed        -> pago aprobado
 *   checkout.session.async_payment_failed / expired -> pago fallido
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly isLive = true;

  private readonly stripe: Stripe;

  constructor() {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY no configurada');
    }
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              // Stripe trabaja en la unidad minima (centimos).
              unit_amount: Math.round(input.amount * 100),
              product_data: {
                name: input.displayName ?? `Pedido ${input.orderNumber}`,
                description: input.description.slice(0, 200),
              },
            },
          },
        ],
        customer_email: input.customerEmail ?? undefined,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // La metadata viaja de vuelta en el webhook: asi sabemos que pedido confirmar.
        metadata: {
          orderId: String(input.orderId),
          orderNumber: input.orderNumber,
        },
      },
      // Idempotencia nativa de Stripe: la misma clave devuelve la MISMA sesion (RN-015).
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) {
      throw ApiError.internal('Stripe no devolvio una URL de pago');
    }

    return {
      providerReference: session.id,
      checkoutUrl: session.url,
      safeResponse: {
        id: session.id,
        status: session.status,
        amountTotal: session.amount_total,
        currency: session.currency,
        expiresAt: session.expires_at,
      },
    };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome {
    if (!signature) throw ApiError.badRequest('Falta la cabecera stripe-signature');
    if (!env.STRIPE_WEBHOOK_SECRET) throw ApiError.internal('STRIPE_WEBHOOK_SECRET no configurada');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      // Firma invalida: puede ser un intento de falsificar un pago (RN-014).
      throw ApiError.unauthorized('Firma del webhook invalida');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') {
          return { kind: 'IGNORED', eventId: event.id, eventType: event.type };
        }
        return {
          kind: 'PAID',
          eventId: event.id,
          eventType: event.type,
          providerReference: session.id,
          method: session.payment_method_types?.[0],
        };
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          kind: 'FAILED',
          eventId: event.id,
          eventType: event.type,
          providerReference: session.id,
          reason: event.type,
        };
      }

      default:
        return { kind: 'IGNORED', eventId: event.id, eventType: event.type };
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const session = await this.stripe.checkout.sessions.retrieve(input.providerReference);
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!paymentIntentId) {
      throw ApiError.unprocessable('El pago no tiene un cobro que se pueda devolver');
    }

    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(input.amount * 100),
      reason: 'requested_by_customer',
      metadata: { motivo: input.reason.slice(0, 100) },
    });

    return { providerReference: refund.id, succeeded: refund.status === 'succeeded' };
  }
}
