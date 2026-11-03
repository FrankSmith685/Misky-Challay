import { env, isProduction } from '@config/env';
import { logger } from '@config/logger';
import { MockProvider } from './mock.provider';
import { StripeProvider } from './stripe.provider';
import { MercadoPagoProvider } from './mercadopago.provider';
import type { PaymentProvider } from './payment.provider';

let provider: PaymentProvider | null = null;

/**
 * Elige el proveedor una sola vez:
 *   con MERCADOPAGO_ACCESS_TOKEN -> Mercado Pago Checkout Pro
 *   con STRIPE_SECRET_KEY        -> Stripe Checkout
 *   sin clave                    -> simulador local (prohibido en produccion)
 */
export const getPaymentProvider = (): PaymentProvider => {
  if (provider) return provider;

  if (env.MERCADOPAGO_ACCESS_TOKEN) {
    provider = new MercadoPagoProvider();
    logger.success(`Pagos: Mercado Pago (${env.MERCADOPAGO_MODE === 'live' ? 'LIVE' : 'test'})`);
    return provider;
  }

  if (env.STRIPE_SECRET_KEY) {
    provider = new StripeProvider();
    logger.success(
      `Pagos: Stripe (${env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'test'})`,
    );
    return provider;
  }

  if (isProduction) {
    throw new Error('En produccion es obligatorio configurar una pasarela de pagos');
  }

  provider = new MockProvider();
  logger.warn('Pagos: SIMULADOR local (configura Mercado Pago o Stripe para cobrar)');
  return provider;
};

export type { PaymentProvider } from './payment.provider';
