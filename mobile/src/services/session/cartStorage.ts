import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem } from '../../types/domain';

const KEY = 'verde-bowl.cart.v1';

export const cartStorage = {
  async read(): Promise<CartItem[]> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    try {
      const value = JSON.parse(raw) as CartItem[];
      return Array.isArray(value) ? value.filter((item) => item?.id && item.quantity > 0) : [];
    } catch { return []; }
  },
  write: (items: CartItem[]) => AsyncStorage.setItem(KEY, JSON.stringify(items)),
  clear: () => AsyncStorage.removeItem(KEY),
};
