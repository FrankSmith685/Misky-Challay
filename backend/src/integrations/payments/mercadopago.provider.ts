import crypto from 'node:crypto';
import { v5 as uuidV5 } from 'uuid';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookContext,
  WebhookOutcome,
} from './payment.provider';

const API_ORIGIN = 'https://api.mercadopago.com';

interface MercadoPagoOrder {
  id: string;
  status: string;
  status_detail?: string;
  total_amount?: string;
  total_paid_amount?: string;
  currency?: string;
  checkout_url?: string;
  expiration_time?: string;
  created_date?: string;
  transactions?: {
    payments?: Array<{ id: string; status?: string; payment_method?: { type?: string } }>;
    refunds?: Array<{ id: string; status?: string; amount?: string }>;
  };
}

const money = (amount: number): string => amount.toFixed(2);
const requestKey = (value: string): string => uuidV5(value, uuidV5.URL);

/** El identificador de la order viene de la URL firmada, nunca del body. */
export const validateMercadoPagoSignature = (
  signature: string | undefined,
  context: WebhookContext | undefined,
  secret: string,
  now = Date.now(),
): string => {
  if (!signature || !context?.requestId || !context.resourceId || !secret) {
    throw ApiError.unauthorized('Faltan datos de la firma de Mercado Pago');
  }
  const values = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=', 2)));
  const timestamp = values.ts;
  const received = values.v1;
  if (!timestamp || !/^\d{10,13}$/.test(timestamp) || !received || !/^[a-f\d]{64}$/i.test(received)) {
    throw ApiError.unauthorized('Firma de Mercado Pago invalida');
  }
  const timestampMs = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs(now - timestampMs) > 5 * 60_000) {
    throw ApiError.unauthorized('Firma de Mercado Pago vencida');
  }
  const resourceId = context.resourceId.toLowerCase();
  const manifest = `id:${resourceId};request-id:${context.requestId};ts:${timestamp};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const actual = Buffer.from(received, 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    throw ApiError.unauthorized('Firma de Mercado Pago invalida');
  }
  return context.resourceId;
};

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';
  readonly isLive = true;

  constructor() {
    if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.MERCADOPAGO_WEBHOOK_SECRET) {
      throw new Error('Mercado Pago requiere Access Token y secreto de webhook');
    }
  }

  private async request<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(idempotencyKey ? { 'X-Idempotency-Key': requestKey(idempotencyKey) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Mercado Pago devuelve códigos y rutas de campos útiles para diagnosticar
      // un 400. No registrar el cuerpo completo: puede contener datos del comprador.
      const payload = await response.json().catch(() => null) as {
        errors?: Array<{ code?: unknown; details?: unknown }>;
      } | null;
      const issues = Array.isArray(payload?.errors)
        ? payload.errors.slice(0, 3).map((issue) => {
          const code = typeof issue.code === 'string' && /^[a-z0-9_]+$/i.test(issue.code)
            ? issue.code : 'unknown';
          const paths = Array.isArray(issue.details)
            ? issue.details.flatMap((detail) => typeof detail === 'string'
              ? (detail.match(/'\$[a-z0-9_.[\]]+'/gi) ?? []).map((path) => path.slice(1, -1))
              : [])
            : [];
          return paths.length ? `${code} (${paths.join(', ')})` : code;
        }).join('; ')
        : '';
      throw ApiError.internal(`Mercado Pago rechazó la operación (${response.status}${issues ? `: ${issues}` : ''})`);
    }
    return response.json() as Promise<T>;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (input.currency.toUpperCase() !== 'PEN' || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw ApiError.unprocessable('Mercado Pago requiere un importe positivo en soles');
    }
    const amount = money(input.amount);
    const safeOrderNumber = input.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 27);
    const result = await this.request<MercadoPagoOrder>('/v1/orders', 'POST', {
      type: 'online',
      processing_mode: 'manual',
      expiration_time: 'PT30M',
      total_amount: amount,
      external_reference: `${safeOrderNumber}_${requestKey(input.idempotencyKey)}`,
      description: input.description.slice(0, 200),
      ...(input.customerEmail ? { payer: { email: input.customerEmail } } : {}),
      items: [{
        title: input.displayName ?? `Pedido ${input.orderNumber}`,
        quantity: 1,
        unit_price: amount,
      }],
      config: {
        online: {
          success_url: input.successUrl,
          failure_url: input.cancelUrl,
          pending_url: input.successUrl,
          auto_return: 'all',
        },
        payment_method: { not_allowed_types: ['ticket'] },
      },
    }, input.idempotencyKey);
    if (!result.id || !result.checkout_url) {
      throw ApiError.internal('Mercado Pago no devolvió una URL de pago');
    }
    const createdAt = result.created_date ? Date.parse(result.created_date) : NaN;
    const expiresAt = Math.floor(((Number.isFinite(createdAt) ? createdAt : Date.now()) + 30 * 60_000) / 1000);
    return {
      providerReference: result.id,
      checkoutUrl: result.checkout_url,
      safeResponse: {
        id: result.id,
        status: result.status,
        amountTotal: result.total_amount,
        currency: result.currency,
        expiresAt,
      },
    };
  }

  async parseWebhook(_rawBody: Buffer, signature: string | undefined, context?: WebhookContext): Promise<WebhookOutcome> {
    const id = validateMercadoPagoSignature(signature, context, env.MERCADOPAGO_WEBHOOK_SECRET ?? '');
    return this.lookupCheckout(id, context?.requestId);
  }

  async lookupCheckout(id: string, eventId?: string): Promise<WebhookOutcome> {
    const order = await this.request<MercadoPagoOrder>(`/v1/orders/${encodeURIComponent(id)}`);
    if (order.id.toLowerCase() !== id.toLowerCase()) {
      throw ApiError.unauthorized('La order de Mercado Pago no coincide con la referencia');
    }
    const outcomeId = eventId ?? `reconcile:${order.id}:${order.status}:${order.status_detail ?? ''}`;
    const eventType = `order.${order.status}`;
    if (order.status === 'processed' && order.status_detail === 'accredited') {
      const charged = Number(order.total_paid_amount);
      const total = Number(order.total_amount);
      if (!Number.isFinite(charged) || !Number.isFinite(total) || total <= 0 || charged < total || order.currency !== 'PEN') {
        throw ApiError.unprocessable('Mercado Pago no acreditó el importe completo');
      }
      return {
        kind: 'PAID', eventId: outcomeId, eventType, providerReference: order.id,
        amount: total, currency: order.currency,
        method: order.transactions?.payments?.[0]?.payment_method?.type,
      };
    }
    if (['failed', 'canceled', 'expired'].includes(order.status)) {
      return { kind: 'FAILED', eventId: outcomeId, eventType, providerReference: order.id, reason: order.status_detail ?? order.status };
    }
    return { kind: 'IGNORED', eventId: outcomeId, eventType };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const id = encodeURIComponent(input.providerReference);
    const order = await this.request<MercadoPagoOrder>(`/v1/orders/${id}`);
    const original = Number(order.total_amount);
    if (!Number.isFinite(original) || input.amount <= 0 || input.amount > original) {
      throw ApiError.unprocessable('Importe de reembolso inválido');
    }
    const full = money(input.amount) === money(original) && order.status_detail !== 'partially_refunded';
    const paymentId = order.transactions?.payments?.find((payment) => payment.status === 'processed')?.id;
    if (!full && !paymentId) throw ApiError.unprocessable('La order no tiene una transacción reembolsable');
    const result = await this.request<MercadoPagoOrder>(
      `/v1/orders/${id}/refund`, 'POST',
      full ? {} : { transactions: [{ id: paymentId, amount: money(input.amount) }] },
      input.idempotencyKey ?? `refund-${input.providerReference}-${money(input.amount)}`,
    );
    const processed = result.transactions?.refunds?.find((refund) => refund.status === 'processed');
    if (!processed?.id) throw ApiError.unprocessable('El reembolso aún no fue confirmado por Mercado Pago');
    return { providerReference: processed.id, succeeded: true };
  }
}
