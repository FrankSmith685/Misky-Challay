import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';

test('un webhook firmado confirma pagos diferidos, pero no sesiones impagas', async () => {
  const secret = 'whsec_test_dulceflow';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dulceflow';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.MERCADOPAGO_ACCESS_TOKEN = '';
  process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
  process.env.MERCADOPAGO_MODE = 'test';

  const { StripeProvider } = await import('../integrations/payments/stripe.provider');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const provider = new StripeProvider();
  const parse = (type: string, paymentStatus: string) => {
    const payload = JSON.stringify({
      id: `evt_${type}_${paymentStatus}`,
      type,
      data: { object: { id: 'cs_test_cake', payment_status: paymentStatus, payment_method_types: ['card'] } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    return provider.parseWebhook(Buffer.from(payload), signature);
  };

  assert.equal(parse('checkout.session.completed', 'unpaid').kind, 'IGNORED');
  assert.deepEqual(parse('checkout.session.async_payment_succeeded', 'paid'), {
    kind: 'PAID',
    eventId: 'evt_checkout.session.async_payment_succeeded_paid',
    eventType: 'checkout.session.async_payment_succeeded',
    providerReference: 'cs_test_cake',
    method: 'card',
  });
  assert.equal(parse('checkout.session.async_payment_failed', 'unpaid').kind, 'FAILED');
  assert.throws(
    () => provider.parseWebhook(Buffer.from('{}'), 'firma-invalida'),
    /Firma del webhook invalida/,
  );
});
