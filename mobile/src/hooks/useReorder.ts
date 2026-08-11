import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCart } from '../providers/CartProvider';
import { usePurchase } from '../providers/PurchaseProvider';
import { useToast } from '../providers/ToastProvider';
import { catalogApi } from '../services/api/catalog.service';
import { customizationApi } from '../services/api/customization.service';
import { ordersApi } from '../services/api/orders.service';
import type { OrderItemDetail, Product } from '../types/domain';

/**
 * Selecciones con las que recotizar la línea, o `null` si ya no se puede rehacer
 * tal cual se pidió: una opción borrada del catálogo obligaría a entregar un
 * plato distinto del que el cliente eligió, y eso lo decide el cliente.
 */
const toSelections = (
  item: OrderItemDetail,
): Array<{ optionId: number; quantity: number }> | null => {
  const selections: Array<{ optionId: number; quantity: number }> = [];
  for (const customization of item.customizations ?? []) {
    if (customization.optionId === null) return null;
    selections.push({ optionId: customization.optionId, quantity: customization.quantity });
  }
  return selections;
};

const joinNames = (names: string[]): string =>
  names.length > 2 ? `${names.slice(0, 2).join(', ')} y ${names.length - 2} más` : names.join(' y ');

export interface UseReorderResult {
  reorder: (orderNumber: string) => Promise<void>;
  /** Número del pedido que se está repitiendo, para el spinner de SU botón. */
  reorderingNumber: string | null;
}

/**
 * «Volver a pedir»: repite un pedido anterior en un toque.
 *
 * El pedido guarda una fotografía, no un carrito. El precio, la nutrición y la
 * disponibilidad de hoy los decide el backend, así que cada línea se recotiza en
 * /customizations/quote antes de entrar al carrito: aquí no se multiplica ni se
 * suma nada. Lo que ya no se puede preparar no se sustituye en silencio, se
 * agrega el resto y se dice qué quedó fuera.
 *
 * Agregar no navega: se avisa con un aviso que ofrece «Ver carrito» y el cliente
 * decide si va ahora o sigue mirando.
 */
export function useReorder(): UseReorderResult {
  const { addItem, cancelEdit } = useCart();
  const { branch } = usePurchase();
  const toast = useToast();
  const [reorderingNumber, setReorderingNumber] = useState<string | null>(null);

  const reorder = useCallback(
    async (orderNumber: string) => {
      setReorderingNumber(orderNumber);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        // Se relee el pedido: el listado puede llevar minutos en pantalla y ahí el
        // detalle de la personalización no siempre viene completo.
        const { order } = await ordersApi.detail(orderNumber);

        // El catálogo solo aporta la foto y el nombre vivo del plato. Si falla, el
        // carrito se arma igual con los datos congelados del pedido.
        const catalog = new Map<number, Product>();
        try {
          const products = await catalogApi.products({ branchId: branch?.id ?? null });
          products.forEach((product) => catalog.set(product.id, product));
        } catch {
          // Sin catálogo se pierde la imagen, no la línea.
        }

        // Repetir un pedido nunca es la edición que el cliente dejó abierta en el
        // constructor: la primera línea no debe pisar aquella.
        cancelEdit();

        const unavailable: string[] = [];
        let added = 0;

        for (const item of order.items) {
          const selections = toSelections(item);
          if (item.productId === null || item.variantId === null || selections === null) {
            unavailable.push(item.productNameSnapshot);
            continue;
          }

          try {
            const quote = await customizationApi.quote({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              branchId: branch?.id ?? null,
              selections,
            });
            const product = catalog.get(item.productId) ?? null;

            addItem({
              productId: item.productId,
              variantId: item.variantId,
              productName: product?.name ?? item.productNameSnapshot,
              variantName: quote.variantName ?? item.variantNameSnapshot ?? 'Presentación',
              imageUrl: product?.imageUrl ?? null,
              quantity: item.quantity,
              unitPrice: quote.unitPrice,
              lineTotal: quote.lineTotal,
              description: quote.description || item.productNameSnapshot,
              selections: quote.selections.map((line) => ({
                optionId: line.optionId,
                quantity: line.quantity,
                groupName: line.groupName,
                optionName: line.optionName,
              })),
            });
            added += 1;
          } catch {
            // Agotado, retirado del menú o incompatible con la cocina de hoy.
            unavailable.push(item.productNameSnapshot);
          }
        }

        if (added === 0) {
          toast.show({
            tone: 'error',
            message: unavailable.length
              ? `Ya no podemos preparar ${joinNames(unavailable)}. Arma tu pedido desde el menú.`
              : 'Este pedido no tiene productos que podamos volver a preparar.',
          });
          return;
        }

        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show({
          tone: unavailable.length ? 'warning' : 'success',
          message: unavailable.length
            ? `Agregamos ${added} de ${order.items.length} productos: ${joinNames(unavailable)} ya no está disponible.`
            : `Agregamos tu pedido ${order.orderNumber} al carrito.`,
          action: { label: 'Ver carrito', onPress: () => router.push('/(tabs)/cart') },
        });
      } catch (caught) {
        toast.show({
          tone: 'error',
          message:
            caught instanceof Error
              ? caught.message
              : 'No pudimos repetir tu pedido. Revisa tu conexión.',
        });
      } finally {
        setReorderingNumber(null);
      }
    },
    [addItem, branch?.id, cancelEdit, toast],
  );

  return { reorder, reorderingNumber };
}
