import * as SecureStore from 'expo-secure-store';
import type { ServiceMode } from '../../types/domain';

const PURCHASE_CONTEXT_KEY = 'verde-bowl.purchase-context';

const SERVICE_MODES: ServiceMode[] = ['DELIVERY', 'PICKUP', 'DINE_IN'];

export interface StoredPurchaseContext {
  serviceMode: ServiceMode;
  branchId: number | null;
  /**
   * Dirección de entrega elegida. La verdad la tiene el servidor
   * (GET /account/purchase-context) y su cobertura se revalida siempre
   * (RN-001), pero guardarla aquí evita que el destino parpadee mientras esa
   * respuesta llega.
   */
  addressId: number | null;
}

/**
 * Cómo y dónde recibe el cliente su último pedido.
 *
 * Es dato de la SESIÓN: la sede que le tocó por cobertura sale de su dirección,
 * así que apunta a dónde vive. Al cerrar sesión se borra con todo lo demás.
 */
export const purchaseStorage = {
  async read(): Promise<StoredPurchaseContext | null> {
    const raw = await SecureStore.getItemAsync(PURCHASE_CONTEXT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredPurchaseContext>;
      const mode = SERVICE_MODES.find((value) => value === parsed.serviceMode);
      if (!mode) return null;
      return {
        serviceMode: mode,
        branchId: typeof parsed.branchId === 'number' ? parsed.branchId : null,
        addressId: typeof parsed.addressId === 'number' ? parsed.addressId : null,
      };
    } catch {
      return null;
    }
  },
  write(value: StoredPurchaseContext) {
    return SecureStore.setItemAsync(PURCHASE_CONTEXT_KEY, JSON.stringify(value));
  },
  clear() {
    return SecureStore.deleteItemAsync(PURCHASE_CONTEXT_KEY);
  },
};
