import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { v5 as uuidV5 } from 'uuid';

const BASE = 'https://api.mercadopago.com';
// Tamaño verificado con este endpoint: limit=20 devuelve "Invalid value for limit".
const INVOICE_PAGE_SIZE = 10;

export interface MpSubscription {
  id: string;
  status: string;
  external_reference?: string;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
}

export interface MpInvoice {
  id: number | string;
  preapproval_id: string;
  status: string;
  currency_id: string;
  transaction_amount: number | string;
  date_created?: string;
  payment?: { id?: number | string; status?: string };
}

export interface MpPayment { id: number | string; status: string; currency_id: string; transaction_amount: number | string; date_approved?: string }

const call = async <T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new ApiError(503, 'Configura Mercado Pago para ofrecer cobros recurrentes', 'SUBSCRIPTIONS_UNAVAILABLE');
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'X-Idempotency-Key': uuidV5(idempotencyKey, uuidV5.URL) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null);
    const message = failure && typeof failure === 'object' && 'message' in failure ? failure.message : null;
    const invalidParameter = typeof message === 'string'
      ? /^Invalid value for ([a-z_]{1,40})$/i.exec(message)?.[1]
      : undefined;
    // Guardamos datos de diagnóstico concretos, sin volcar el cuerpo del proveedor
    // ni los headers de la solicitud, que incluyen credenciales y datos del cliente.
    throw new ApiError(502, `Mercado Pago no pudo procesar la suscripción (${response.status})`, 'SUBSCRIPTION_PROVIDER_ERROR', {
      providerStatus: response.status,
      ...(invalidParameter ? { invalidParameter } : {}),
      ...(response.headers.get('x-request-id') ? { providerRequestId: response.headers.get('x-request-id')!.slice(0, 120) } : {}),
    });
  }
  return response.json() as Promise<T>;
};

export const mpSubscriptions = {
  enabled: () => Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
  create: (input: { id: number; email: string; name: string; amount: number; backUrl: string }) =>
    call<MpSubscription>('/preapproval', 'POST', {
      reason: `${input.name} - Misky Challay`.slice(0, 150),
      external_reference: `BOX-${input.id}`,
      payer_email: input.email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: input.amount, currency_id: 'PEN' },
      back_url: input.backUrl,
      status: 'pending',
    }),
  get: (id: string) => call<MpSubscription>(`/preapproval/${encodeURIComponent(id)}`),
  findByExternalReference: async (reference: string, email: string): Promise<MpSubscription | null> => {
    // El buscador de preapprovals filtra por payer_email, no por external_reference.
    // Se pagina y luego se contrasta la referencia local exacta.
    for (let offset = 0; offset < 1000; offset += 100) {
      const query = new URLSearchParams({ payer_email: email, limit: '100', offset: String(offset) });
      const result = await call<{ results?: MpSubscription[] }>(`/preapproval/search?${query}`);
      const found = (result.results ?? []).find((entry) => entry.external_reference === reference);
      if (found) return found;
      if ((result.results ?? []).length < 100) break;
    }
    return null;
  },
  cancel: (id: string) => call<MpSubscription>(`/preapproval/${encodeURIComponent(id)}`, 'PUT', { status: 'canceled' }),
  invoice: (id: string) => call<MpInvoice>(`/authorized_payments/${encodeURIComponent(id)}`),
  invoiceByPayment: async (paymentId: string): Promise<MpInvoice | null> => {
    const query = new URLSearchParams({ payment_id: paymentId, limit: '1' });
    const result = await call<{ results?: MpInvoice[] }>(`/authorized_payments/search?${query}`);
    return result.results?.[0] ?? null;
  },
  payment: (id: string) => call<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`),
  invoices: async (id: string): Promise<MpInvoice[]> => {
    const result: MpInvoice[] = [];
    for (let offset = 0; offset < 100; offset += INVOICE_PAGE_SIZE) {
      const query = new URLSearchParams({ preapproval_id: id, limit: String(INVOICE_PAGE_SIZE), offset: String(offset), sort: 'date_created:asc' });
      const page = await call<{ results?: MpInvoice[] }>(`/authorized_payments/search?${query}`);
      const rows = page.results ?? [];
      result.push(...rows);
      if (rows.length < INVOICE_PAGE_SIZE) break;
    }
    return result;
  },
  refundPayment: async (paymentId: string, amount: number, key: string) => {
    const refund = await call<{ id: number | string; status: string }>(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, 'POST', { amount }, key);
    if (refund.status !== 'approved') throw ApiError.unprocessable('Mercado Pago no confirmó el reembolso');
    return { providerReference: String(refund.id), succeeded: true };
  },
};
