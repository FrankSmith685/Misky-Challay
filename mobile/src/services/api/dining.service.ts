import type { PublicDiningTable } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface DiningOrderInput {
  guestName?: string;
  notes?: string;
  items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number }>;
  /**
   * Misma clave al reintentar: el pedido de mesa AÑADE platos a la comanda
   * abierta, así que un reenvío sin clave hace que la cocina prepare dos veces lo
   * mismo. Viaja en el cuerpo y en la cabecera estándar.
   */
  idempotencyKey: string;
}

export const diningApi = {
  table: (token: string) => apiRequest<PublicDiningTable>(ENDPOINTS.dining.table(token)),

  /**
   * El wifi del local es lo que es: 20 s (el plazo por defecto) se agotan y el
   * comensal reintenta, por eso este POST espera más que el resto.
   */
  order: (token: string, input: DiningOrderInput) =>
    apiRequest<{ orderNumber: string; status: string; total: number }>(
      ENDPOINTS.dining.order(token),
      {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': input.idempotencyKey },
        timeoutMs: 30_000,
      },
    ),
};
