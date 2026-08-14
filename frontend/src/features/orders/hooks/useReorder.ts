import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { useAppDispatch } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem, cancelItemEdit } from '@features/cart/cartSlice';
import { builderApi } from '@features/builder/services/builder.service';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { ordersApi } from '../services/orders.service';
import type { Product } from '@features/catalog/types';
import type { OrderItemDetail } from '@features/checkout/types';

interface UseReorderResult {
  /** Reconstruye el carrito con las lineas del pedido y lleva al carrito. */
  reorder: (orderNumber: string) => Promise<void>;
  isReordering: boolean;
}

/**
 * Selecciones con las que recotizar la linea, o `null` si ya no se puede rehacer
 * tal cual se pidio: una opcion borrada del catalogo (optionId nulo) obligaria a
 * entregar un plato distinto del que el cliente eligio, y eso lo decide el cliente.
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

/**
 * "Volver a pedir": repite un pedido anterior en un toque.
 *
 * El pedido guarda una fotografia (RN-017), no un carrito: el precio, la nutricion
 * y la disponibilidad de hoy los decide el backend (RN-007), asi que cada linea se
 * recotiza antes de entrar al carrito. Lo que ya no se puede rehacer no se sustituye
 * en silencio: se agrega el resto y se dice cual quedo fuera.
 */
export const useReorder = (): UseReorderResult => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { branchId } = useAppState();
  const [isReordering, setIsReordering] = useState(false);

  const reorder = useCallback(
    async (orderNumber: string) => {
      setIsReordering(true);
      try {
        // Se relee el pedido: la lista puede llevar minutos en pantalla y ahi el
        // detalle de la personalizacion no siempre esta completo.
        const { order } = await ordersApi.detail(orderNumber);

        // Solo aporta la foto y el nombre vivo del plato. Si falla, el carrito se
        // arma igual con los datos congelados del pedido.
        const catalog = new Map<number, Product>();
        try {
          const products = await catalogApi.getProducts({ branchId });
          products.forEach((product) => catalog.set(product.id, product));
        } catch {
          // Sin catalogo el carrito pierde la imagen, no la linea.
        }

        // Repetir un pedido nunca es la edicion que el cliente dejo abierta en el
        // constructor: la primera linea personalizada no debe pisar aquella.
        dispatch(cancelItemEdit());

        const unavailable: string[] = [];
        let added = 0;

        for (const item of order.items) {
          const selections = toSelections(item);
          if (item.productId === null || item.variantId === null || selections === null) {
            unavailable.push(item.productNameSnapshot);
            continue;
          }

          try {
            const quote = await builderApi.quote({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              branchId,
              selections,
            });
            const product = catalog.get(item.productId);

            dispatch(addItem({
              id: crypto.randomUUID(),
              productId: item.productId,
              variantId: item.variantId,
              name: product?.name ?? item.productNameSnapshot,
              variantName: quote.description,
              imageUrl: product?.imageUrl ?? null,
              quantity: item.quantity,
              unitPrice: quote.basePrice,
              extrasTotal: quote.extrasTotal,
              lineTotal: quote.lineTotal,
              selections: quote.selections.map((line) => ({
                groupId: line.groupId,
                groupName: line.groupName,
                optionId: line.optionId,
                optionName: line.optionName,
                quantity: line.quantity,
                priceDelta: line.priceDelta,
              })),
              nutrition: quote.nutrition,
            }));
            added += 1;
          } catch {
            // Agotado, retirado del menu o incompatible con la cocina de hoy.
            unavailable.push(item.productNameSnapshot);
          }
        }

        if (added === 0) {
          toast.error(
            unavailable.length > 0
              ? `Ya no podemos preparar ${joinNames(unavailable)}. Arma el pedido desde el menú.`
              : 'Este pedido no tiene productos que podamos volver a preparar.',
          );
          return;
        }

        if (unavailable.length > 0) {
          toast.warning(`Agregamos ${added} de ${order.items.length} productos: ${joinNames(unavailable)} ya no está disponible.`);
        } else {
          toast.success(`Agregamos tu pedido ${order.orderNumber} al carrito.`);
        }
        navigate(ROUTES.cart);
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      } finally {
        setIsReordering(false);
      }
    },
    [branchId, dispatch, navigate],
  );

  return { reorder, isReordering };
};
