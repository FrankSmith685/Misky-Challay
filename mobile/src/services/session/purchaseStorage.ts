import * as SecureStore from 'expo-secure-store';
import type { ServiceMode } from '../../types/domain';

const PURCHASE_CONTEXT_KEY = 'verde-bowl.purchase-context';

export interface StoredPurchaseContext {
  serviceMode: ServiceMode;
  branchId: number | null;
}

export const purchaseStorage = {
  async read(): Promise<StoredPurchaseContext | null> {
    const raw = await SecureStore.getItemAsync(PURCHASE_CONTEXT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredPurchaseContext>;
      if (!['DELIVERY', 'PICKUP', 'DINE_IN'].includes(parsed.serviceMode ?? '')) return null;
      return {
        serviceMode: parsed.serviceMode as ServiceMode,
        branchId: typeof parsed.branchId === 'number' ? parsed.branchId : null,
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
