import { env, isProduction } from '@config/env';
import { logger } from '@config/logger';
import { MockProvider } from './mock.provider';
import { StripeProvider } from './stripe.provider';
import type { PaymentProvider } from './payment.provider';

let provider: PaymentProvider | null = null;

/**
 * Elige el proveedor una sola vez:
 *   con STRIPE_SECRET_KEY  -> Stripe real (test o live, segun la clave)
 *   sin clave              -> simulador local (prohibido en produccion)
 */
export const getPaymentProvider = (): PaymentProvider => {
  if (provider) return provider;

  if (env.STRIPE_SECRET_KEY) {
    provider = new StripeProvider();
    logger.success(
      `Pagos: Stripe (${env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'test'})`,
    );
    return provider;
  }

  if (isProduction) {
    throw new Error('En produccion es obligatorio configurar STRIPE_SECRET_KEY');
  }

  provider = new MockProvider();
  logger.warn('Pagos: SIMULADOR local (define STRIPE_SECRET_KEY para usar Stripe)');
  return provider;
};

export type { PaymentProvider } from './payment.provider';
