import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export const isDemoDirectQr = (url: string): boolean => {
  try { return /\/images\/payments\/demo-(yape|plin)-qr\.svg$/.test(new URL(url, 'https://local.invalid').pathname); }
  catch { return false; }
};

export type DirectPaymentState =
  | 'AWAITING_PAYMENT'
  | 'REVIEW'
  | 'OBSERVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';
export const DIRECT_PAYMENT_LABELS: Record<DirectPaymentState, string> = {
  AWAITING_PAYMENT: 'Pendiente de pago',
  REVIEW: 'Por verificar',
  OBSERVED: 'Necesita corrección',
  CONFIRMED: 'Pago confirmado',
  REJECTED: 'Pago rechazado',
  EXPIRED: 'Plazo vencido',
  REFUND_PENDING: 'Devolución pendiente',
  REFUNDED: 'Devuelto',
};
export const PAYMENT_STAGE_LABELS = {
  FULL: 'Pago total',
  DEPOSIT: 'Anticipo',
  BALANCE: 'Saldo de la torta',
};

export interface DirectPaymentDetail {
  paymentId: number;
  provider: 'yape' | 'plin';
  amount: number;
  currency: string;
  stage: 'FULL' | 'DEPOSIT' | 'BALANCE';
  state: DirectPaymentState;
  recipient: {
    phone: string;
    recipient: string;
    qrImageUrl: string;
    instructions: string;
    expiresAt: string | null;
    reviewAlertMinutes: number;
  };
  orderNumber: string;
  orderStatus: string;
  branchId: number;
  branchName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
  canReport: boolean;
  overdue: boolean;
  reviewAgeMinutes: number;
  hasEvidence: boolean;
  refundableAmount: number;
  refundedAmount: number;
  platformCommission: {
    rate: number;
    baseAmount: number | null;
    amount: number | null;
    settledAmount: number;
    outstandingAmount: number | null;
    status: string | null;
  };
  claim: {
    status: string;
    operationCode: string;
    payerName: string | null;
    payerPhone: string | null;
    paidAt: string | null;
    declaredAmount: number;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: number | null;
    reason: string | null;
  } | null;
  history: Array<{
    id: number;
    kind: string;
    details: Record<string, unknown> | null;
    actorId: number | null;
    actorName: string | null;
    createdAt: string;
    hasEvidence: boolean;
  }>;
  refunds: Array<{
    id: number;
    amount: number;
    status: string;
    reference: string | null;
    reason: string;
    createdAt: string;
  }>;
}
export interface DirectPaymentReport {
  operationCode: string;
  payerName: string;
  payerPhone?: string;
  paidAt: string;
  amount: number;
  evidenceDataUrl?: string;
}
export interface DirectPaymentList {
  items: DirectPaymentDetail[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<DirectPaymentState, number>>;
  amounts: Partial<Record<DirectPaymentState, number>>;
  summary: {
    totalAmount: number;
    amounts: Partial<Record<DirectPaymentState, number>>;
    overdueCount: number;
    overdueAmount: number;
    platformRate: number;
    platformAccrued: number;
    platformSettled: number;
    platformOutstanding: number;
  };
}

export const directPaymentsApi = {
  async detail(id: number): Promise<DirectPaymentDetail> {
    return (await api.get<ApiSuccess<DirectPaymentDetail>>(`/payments/${id}/mobile`)).data.data;
  },
  async report(id: number, report: DirectPaymentReport): Promise<DirectPaymentDetail> {
    return (
      await api.post<ApiSuccess<DirectPaymentDetail>>(`/payments/${id}/mobile/report`, report)
    ).data.data;
  },
  async list(
    branchId: number | null | undefined,
    filters: { state?: string; provider?: string; search?: string; page?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ): Promise<DirectPaymentList> {
    return (
      await api.get<ApiSuccess<DirectPaymentList>>('/payments/mobile', {
        params: { ...(branchId ? { branchId } : {}), ...filters },
        signal,
      })
    ).data.data;
  },
  async review(
    id: number,
    decision: 'APPROVE' | 'OBSERVE' | 'REJECT',
    reason?: string,
  ): Promise<DirectPaymentDetail> {
    return (
      await api.post<ApiSuccess<DirectPaymentDetail>>(`/payments/${id}/mobile/decision`, {
        decision,
        reason,
      })
    ).data.data;
  },
  async evidence(id: number, eventId: number): Promise<Blob> {
    return (await api.get(`/payments/${id}/mobile/evidence/${eventId}`, { responseType: 'blob' }))
      .data;
  },
  async refund(
    id: number,
    amount: number,
    reference: string,
    reason: string,
  ): Promise<DirectPaymentDetail> {
    return (
      await api.post<ApiSuccess<DirectPaymentDetail>>(`/payments/${id}/mobile/refund-record`, {
        amount,
        reference,
        reason,
      })
    ).data.data;
  },
  async recoveryReport(
    id: number,
    report: DirectPaymentReport & { reason: string },
  ): Promise<DirectPaymentDetail> {
    return (
      await api.post<ApiSuccess<DirectPaymentDetail>>(
        `/payments/${id}/mobile/recovery-report`,
        report,
      )
    ).data.data;
  },
  async openBalance(orderNumber: string, method: 'YAPE' | 'PLIN'): Promise<DirectPaymentDetail> {
    return (
      await api.post<ApiSuccess<{ directPayment: DirectPaymentDetail }>>(
        `/orders/${orderNumber}/payment/balance`,
        { method },
      )
    ).data.data.directPayment;
  },
};
