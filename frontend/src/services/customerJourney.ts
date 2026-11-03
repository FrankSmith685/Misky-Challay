import { api } from '@services/api/client';
import type { CheckoutTerms } from './checkoutTerms';
export interface CustomerCase {
  id: number;
  kind: 'SUPPORT' | 'CHANGE' | 'DESIGN';
  status: string;
  version: number;
  payloadJson: {
    changes?: Record<string, unknown>;
    proposal?: string;
    priceDifference?: number;
    additionalBalance?: number;
    changeSummary?: { scheduledAt?: string; contactName?: string; contactPhone?: string; addressLine?: string; deliveryFee?: number };
    agreements?: Array<{ proposalVersion: number; acceptedAt: string; proposal: string; priceDifference?: number }>;
  };
  messagesJson: Array<{
    id: string;
    author: 'CUSTOMER' | 'STAFF';
    text: string;
    createdAt: string;
  }>;
}
export interface CustomerCare {
  version: number;
  content: string;
  productInstructionsJson: Record<string, string>;
}
export interface JourneyData {
  cases: CustomerCase[];
  care: { content: string; products: Array<{ name: string; instructions: string }> };
  gift?: { token: string; recipientName: string; hidePrices: boolean; message?: string };
}
const unwrap = <T>(result: { data: { data: T } }) => result.data.data;
export const subscriptionTermsApi = {
  get: async (): Promise<CheckoutTerms> => {
    const value = unwrap<CheckoutTerms>(await api.get('/customer/subscription-terms'));
    if (!value || typeof value.content !== 'string')
      throw new Error('No pudimos cargar las condiciones de suscripción.');
    return value;
  },
  publish: async (input: Omit<CheckoutTerms, 'publishedAt'>): Promise<CheckoutTerms> =>
    unwrap(await api.put('/customer/subscription-terms', input)),
};
export const customerJourneyApi = {
  options: async(number:string,address?:unknown,staff=false):Promise<{slots:import('@features/geo/types').DeliverySlot[];priceDifference:number}> => unwrap(await api.post(`/customer/${staff?'admin/':''}orders/${encodeURIComponent(number)}/change-options`,{address})),
  get: async (number: string, staff = false): Promise<JourneyData> =>
    unwrap(await api.get(`/customer/${staff ? 'admin/' : ''}orders/${encodeURIComponent(number)}`)),
  create: async (number: string, input: unknown) =>
    unwrap(await api.post(`/customer/orders/${encodeURIComponent(number)}/cases`, input)),
  act: async (number: string, id: number, input: unknown, staff = false) =>
    unwrap(
      await api.post(
        `/customer/${staff ? 'admin/' : ''}orders/${encodeURIComponent(number)}/cases/${id}`,
        input,
      ),
    ),
  design: async (number: string, text: string) =>
    unwrap(await api.post(`/customer/admin/orders/${encodeURIComponent(number)}/design`, { text })),
  care: async (): Promise<CustomerCare> => {
    const value = unwrap<CustomerCare>(await api.get('/customer/care'));
    if (!value || typeof value.content !== 'string' || !value.productInstructionsJson)
      throw new Error('No pudimos cargar las indicaciones de posventa.');
    return value;
  },
  publishCare: async (input: CustomerCare): Promise<CustomerCare> =>
    unwrap(await api.put('/customer/care', input)),
};
