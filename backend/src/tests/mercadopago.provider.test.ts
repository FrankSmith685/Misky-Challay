import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

test('Checkout Pro crea el cobro correcto y solo acredita una order firmada y pagada', async () => {
  const secret = 'mp-webhook-secret-for-tests';
  process.env.NODE_ENV = 'test';
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-access-token-for-tests';
  process.env.MERCADOPAGO_WEBHOOK_SECRET = secret;
  process.env.MERCADOPAGO_MODE = 'test';
  process.env.STRIPE_SECRET_KEY = '';
  process.env.STRIPE_WEBHOOK_SECRET = '';
  const { MercadoPagoProvider, validateMercadoPagoSignature } = await import('../integrations/payments/mercadopago.provider');
  const provider = new MercadoPagoProvider();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown>; idempotency?: string }> = [];
  let status = 'processed';
  let statusDetail = 'accredited';
  let rejectOrder = false;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({
      url, method,
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
      idempotency: new Headers(init?.headers).get('X-Idempotency-Key') ?? undefined,
    });
    if (method === 'POST' && url.endsWith('/v1/orders')) {
      if (rejectOrder) {
        return Response.json({ errors: [{
          code: 'property_value',
          details: ["'$.external_reference' - does not match pattern"],
        }] }, { status: 400 });
      }
      return Response.json({ id: 'ORDTESTCAKE01', checkout_url: 'https://www.mercadopago.com.pe/checkout/v1/redirect?order_id=ORDTESTCAKE01', status: 'created', total_amount: '80.00', currency: 'PEN' });
    }
    if (method === 'POST' && url.endsWith('/refund')) {
      return Response.json({ id: 'ORDTESTCAKE01', status: 'processed', status_detail: 'partially_refunded', transactions: { refunds: [{ id: 'REF01', status: 'processed', amount: '20.00' }] } });
    }
    return Response.json({
      id: 'ORDTESTCAKE01', status, status_detail: statusDetail,
      total_amount: '80.00', total_paid_amount: status === 'processed' ? '80.00' : '0.00', currency: 'PEN',
      transactions: { payments: [{ id: 'PAY01', status: 'processed', payment_method: { type: 'credit_card' } }] },
    });
  };

  try {
    const checkout = await provider.createCheckout({
      orderId: 7, orderNumber: 'DF-123', amount: 80, currency: 'PEN',
      description: 'Anticipo de torta', displayName: 'Anticipo de torta DF-123',
      idempotencyKey: 'order-7-deposit-1',
      successUrl: 'https://dulceflow.test/checkout/confirmacion?pedido=DF-123',
      cancelUrl: 'https://dulceflow.test/checkout/confirmacion?pedido=DF-123&pago=cancelado',
    });
    assert.equal(checkout.providerReference, 'ORDTESTCAKE01');
    assert.equal(requests[0].body?.total_amount, '80.00');
    assert.equal(requests[0].body?.expiration_time, 'PT30M');
    assert.match(String(requests[0].body?.external_reference), /^[a-zA-Z0-9_-]{1,64}$/);
    assert.deepEqual((requests[0].body?.items as Array<Record<string, unknown>>)[0], {
      title: 'Anticipo de torta DF-123', quantity: 1, unit_price: '80.00',
    });
    assert.ok(Number(checkout.safeResponse.expiresAt) > Math.floor(Date.now() / 1000) + 29 * 60);
    assert.match(requests[0].idempotency ?? '', /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i);

    const requestId = 'request-cake-1';
    const resourceId = 'ORDTESTCAKE01';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signatureHash = crypto.createHmac('sha256', secret)
      .update(`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${timestamp};`).digest('hex');
    const signature = `ts=${timestamp},v1=${signatureHash}`;
    const context = { requestId, resourceId };
    assert.equal(validateMercadoPagoSignature(signature, context, secret), resourceId);
    assert.deepEqual(await provider.parseWebhook(Buffer.from('{}'), signature, context), {
      kind: 'PAID', eventId: requestId, eventType: 'order.processed',
      providerReference: resourceId, amount: 80, currency: 'PEN', method: 'credit_card',
    });
    assert.deepEqual(await provider.lookupCheckout(resourceId), {
      kind: 'PAID', eventId: `reconcile:${resourceId}:processed:accredited`, eventType: 'order.processed',
      providerReference: resourceId, amount: 80, currency: 'PEN', method: 'credit_card',
    });
    await assert.rejects(provider.parseWebhook(Buffer.from('{}'), `ts=${timestamp},v1=${'0'.repeat(64)}`, context), /Firma de Mercado Pago invalida/);

    status = 'processing';
    statusDetail = 'in_process';
    assert.equal((await provider.parseWebhook(Buffer.from('{}'), signature, context)).kind, 'IGNORED');
    assert.equal((await provider.lookupCheckout(resourceId)).eventType, 'order.processing');
    status = 'failed';
    statusDetail = 'rejected_by_issuer';
    assert.equal((await provider.parseWebhook(Buffer.from('{}'), signature, context)).kind, 'FAILED');

    status = 'processed';
    const refund = await provider.refund({ providerReference: resourceId, amount: 20, reason: 'Prueba', idempotencyKey: 'refund-1' });
    assert.equal(refund.providerReference, 'REF01');
    assert.deepEqual(requests.at(-1)?.body?.transactions, [{ id: 'PAY01', amount: '20.00' }]);

    rejectOrder = true;
    await assert.rejects(provider.createCheckout({
      orderId: 8, orderNumber: 'DF-124', amount: 80, currency: 'PEN',
      description: 'Torta', idempotencyKey: 'order-8-full-1',
      successUrl: 'https://dulceflow.test/ok', cancelUrl: 'https://dulceflow.test/cancel',
    }), /property_value \(\$\.external_reference\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
