import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { ApiError } from '../shared/errors/ApiError';

test('la suscripción mensual usa PEN, una referencia estable y cancelación real', async (context) => {
  process.env.NODE_ENV = 'test';
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-subscriptions';
  process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-secret';
  process.env.MERCADOPAGO_MODE = 'test';
  process.env.STRIPE_SECRET_KEY = '';
  process.env.STRIPE_WEBHOOK_SECRET = '';
  const { mpSubscriptions } = await import('../modules/subscriptions/mercadoPagoSubscriptions');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path: url.pathname + url.search, method: init?.method ?? 'GET', body });
    if (url.pathname === '/preapproval' && init?.method === 'POST') return Response.json({ id: 'SUB-1', init_point: 'https://mercadopago.test/subscribe', external_reference: 'BOX-17', status: 'pending' });
    if (url.pathname === '/preapproval/SUB-1' && init?.method === 'PUT') return Response.json({ id: 'SUB-1', status: 'canceled', external_reference: 'BOX-17' });
    if (url.pathname === '/preapproval/SUB-1') return Response.json({ id: 'SUB-1', status: 'authorized', external_reference: 'BOX-17' });
    if (url.pathname === '/preapproval/search') return Response.json({ results: [{ id: 'SUB-1', status: 'authorized', external_reference: 'BOX-17' }] });
    if (url.pathname === '/authorized_payments/search') return Response.json({ results: url.searchParams.get('payment_id') === '9999' ? [] : [{ id: 25, preapproval_id: 'SUB-1', currency_id: 'PEN', transaction_amount: 70, payment: { id: 10, status: 'approved' } }] });
    if (url.pathname === '/v1/payments/10') return Response.json({ id: 10, status: 'approved', currency_id: 'PEN', transaction_amount: 70 });
    return Response.json({}, { status: 404 });
  };
  try {
    const created = await mpSubscriptions.create({ id: 17, email: 'cliente@example.com', name: 'Caja mensual', amount: 70, backUrl: 'https://tienda.test/cuenta/suscripciones' });
    assert.equal(created.init_point, 'https://mercadopago.test/subscribe');
    assert.equal(calls[0].body?.external_reference, 'BOX-17');
    assert.equal(calls[0].body?.status, 'pending');
    assert.deepEqual(calls[0].body?.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 70, currency_id: 'PEN' });
    assert.equal((await mpSubscriptions.get('SUB-1')).status, 'authorized');
    assert.equal((await mpSubscriptions.findByExternalReference('BOX-17', 'cliente@example.com'))?.id, 'SUB-1');
    assert.match(calls.at(-1)?.path ?? '', /payer_email=cliente%40example.com/);
    assert.equal((await mpSubscriptions.invoices('SUB-1'))[0].payment?.id, 10);
    assert.equal((await mpSubscriptions.invoiceByPayment('10'))?.id, 25);
    assert.match(calls.at(-1)?.path ?? '', /payment_id=10/);
    assert.equal((await mpSubscriptions.payment('10')).transaction_amount, 70);
    assert.equal((await mpSubscriptions.cancel('SUB-1')).status, 'canceled');
    assert.deepEqual(calls.at(-1), { path: '/preapproval/SUB-1', method: 'PUT', body: { status: 'canceled' } });
    const { subscriptionsService } = await import('../modules/subscriptions/subscriptions.service');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const requestId = 'request-1';
    const digest = crypto.createHmac('sha256', 'test-secret').update(`id:9999;request-id:${requestId};ts:${timestamp};`).digest('hex');
    assert.deepEqual(await subscriptionsService.handleWebhook(`ts=${timestamp},v1=${digest}`, requestId, '9999', 'payment'), { handled: false });
    await assert.rejects(subscriptionsService.handleWebhook('ts=1,v1=bad', requestId, '9999', 'payment'));

    await context.test('consulta cuotas con páginas aceptadas de 10 y no salta resultados', async () => {
      const offsets: number[] = [];
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/authorized_payments/search');
        assert.equal(url.searchParams.get('preapproval_id'), 'SUB-1');
        assert.equal(url.searchParams.get('sort'), 'date_created:asc');
        if (url.searchParams.get('limit') !== '10') return Response.json({ message: 'Invalid value for limit' }, { status: 400 });
        const offset = Number(url.searchParams.get('offset'));
        offsets.push(offset);
        return Response.json({ results: Array.from({ length: Math.min(10, 23 - offset) }, (_, index) => ({ id: offset + index + 1 })) });
      };
      const invoices = await mpSubscriptions.invoices('SUB-1');
      assert.deepEqual(offsets, [0, 10, 20]);
      assert.deepEqual(invoices.map((invoice) => invoice.id), Array.from({ length: 23 }, (_, index) => index + 1));
    });

    await context.test('una suscripción sin cuotas termina con una lista vacía', async () => {
      let count = 0;
      globalThis.fetch = async () => { count += 1; return Response.json({ results: [] }); };
      assert.deepEqual(await mpSubscriptions.invoices('SUB-2'), []);
      assert.equal(count, 1);
    });

    await context.test('un error en otra página se propaga y no parece una conciliación completa', async () => {
      globalThis.fetch = async (input) => {
        const offset = new URL(String(input)).searchParams.get('offset');
        return offset === '0' ? Response.json({ results: Array.from({ length: 10 }, (_, index) => ({ id: index + 1 })) }) : Response.json({ message: 'Unavailable' }, { status: 503 });
      };
      await assert.rejects(mpSubscriptions.invoices('SUB-1'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.statusCode, 502);
        assert.deepEqual(error.details, { providerStatus: 503 });
        return true;
      });
    });

    await context.test('el error conserva el parámetro rechazado y la referencia de soporte', async () => {
      globalThis.fetch = async () => Response.json({ message: 'Invalid value for limit', token: process.env.MERCADOPAGO_ACCESS_TOKEN }, { status: 400, headers: { 'x-request-id': 'subscription-request-test' } });
      await assert.rejects(mpSubscriptions.invoices('SUB-1'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'SUBSCRIPTION_PROVIDER_ERROR');
        assert.deepEqual(error.details, { providerStatus: 400, invalidParameter: 'limit', providerRequestId: 'subscription-request-test' });
        assert.equal(JSON.stringify(error.details).includes(process.env.MERCADOPAGO_ACCESS_TOKEN!), false);
        return true;
      });
    });

    await context.test('un cuerpo de error no JSON conserva el estado HTTP del proveedor', async () => {
      globalThis.fetch = async () => new Response('Service unavailable', { status: 503 });
      await assert.rejects(mpSubscriptions.invoices('SUB-1'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.deepEqual(error.details, { providerStatus: 503 });
        return true;
      });
    });
  } finally { globalThis.fetch = originalFetch; }
});
