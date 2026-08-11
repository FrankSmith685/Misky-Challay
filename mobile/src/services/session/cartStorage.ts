import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem } from '../../types/domain';

const KEY = 'verde-bowl.cart.v1';

/**
 * Una línea vale solo si trae lo que el checkout necesita para recotizarla. Un
 * carrito a medio escribir (la app murió durante el guardado) o de una versión
 * anterior del formato no puede llegar a /checkout/quote: se descarta la línea,
 * no el carrito entero.
 */
const isUsable = (item: CartItem | undefined | null): item is CartItem =>
  Boolean(item) &&
  typeof item?.id === 'string' &&
  Number.isFinite(item.productId) &&
  Number.isFinite(item.variantId) &&
  Number.isFinite(item.quantity) &&
  item.quantity > 0;

/**
 * Carrito del dispositivo.
 *
 * Es dato de la SESIÓN: lleva lo que esa persona iba a comer, sus notas para la
 * cocina y los bowls que armó. Al cerrar sesión se borra, igual que los tokens.
 */
export const cartStorage = {
  async read(): Promise<CartItem[]> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];

    try {
      const value = JSON.parse(raw) as CartItem[];
      return Array.isArray(value) ? value.filter(isUsable) : [];
    } catch {
      return [];
    }
  },

  write(items: CartItem[]): Promise<void> {
    return AsyncStorage.setItem(KEY, JSON.stringify(items));
  },

  clear(): Promise<void> {
    return AsyncStorage.removeItem(KEY);
  },
};
