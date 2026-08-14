import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cartStorage } from '../services/session/cartStorage';
import type { CartItem } from '../types/domain';

/** Línea retirada y el sitio exacto que ocupaba, para poder devolverla ahí mismo. */
export interface RemovedCartLine {
  item: CartItem;
  index: number;
}

interface CartContextValue {
  items: CartItem[];
  units: number;
  subtotal: number;
  hydrated: boolean;
  /**
   * Línea que el cliente está reeditando en el constructor. Mientras exista, el
   * siguiente `addItem` del MISMO producto la reemplaza en su sitio en vez de
   * añadir una segunda línea casi idéntica.
   */
  editing: CartItem | null;
  addItem(item: Omit<CartItem, 'id'>): void;
  setQuantity(id: string, quantity: number): void;
  /** Devuelve lo retirado para poder ofrecer «Deshacer»; null si ya no estaba. */
  removeItem(id: string): RemovedCartLine | null;
  restoreItem(removed: RemovedCartLine): void;
  /** Arranca la edición de una línea y devuelve su contenido para precargarlo. */
  beginEdit(id: string): CartItem | null;
  cancelEdit(): void;
  clear(): Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Tope por línea; el backend valida el mismo máximo al cotizar. */
const MAX_QUANTITY = 20;

const itemId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Importe de la línea. Es REFERENCIAL y solo sirve para pintar el carrito: el
 * precio real (con promociones, IGV y delivery) lo devuelve /checkout/quote.
 */
const lineTotalFor = (unitPrice: number, quantity: number) =>
  Number((unitPrice * quantity).toFixed(2));

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /*
   * Copias vivas del estado. `removeItem` y `beginEdit` tienen que responder en
   * el acto —quien las llama necesita lo que había para ofrecer «Deshacer» o
   * precargar el constructor— y no pueden esperar al siguiente render.
   */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;

  useEffect(() => {
    let active = true;
    void cartStorage
      .read()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) void cartStorage.write(items);
  }, [hydrated, items]);

  const addItem = useCallback((incoming: Omit<CartItem, 'id'>) => {
    const pendingId = editingIdRef.current;

    setItems((current) => {
      const index = pendingId === null ? -1 : current.findIndex((row) => row.id === pendingId);
      const target = index >= 0 ? current[index] : null;

      /*
       * Solo se reemplaza si vuelve el MISMO producto. Si el cliente abandonó el
       * constructor y después agregó otra cosa desde el menú, eso es una línea
       * nueva: sin esta comprobación una bebida borraría el bowl que iba a editar.
       */
      if (target && target.productId === incoming.productId) {
        const next = [...current];
        next[index] = { ...incoming, id: target.id };
        return next;
      }

      // Un plato fijo agregado varias veces desde la lista rápida conserva una
      // sola línea y aumenta su cantidad. Las recetas personalizadas nunca se
      // fusionan: dos bowls pueden parecer iguales y aun así ser intencionales.
      if (incoming.selections.length === 0) {
        const fixedIndex = current.findIndex(
          (row) =>
            row.productId === incoming.productId &&
            row.variantId === incoming.variantId &&
            row.selections.length === 0,
        );
        if (fixedIndex >= 0) {
          const existing = current[fixedIndex];
          const quantity = Math.min(MAX_QUANTITY, existing.quantity + incoming.quantity);
          const next = [...current];
          next[fixedIndex] = {
            ...existing,
            quantity,
            lineTotal: lineTotalFor(existing.unitPrice, quantity),
          };
          return next;
        }
      }

      return [...current, { ...incoming, id: itemId() }];
    });

    setEditingId(null);
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    // Nunca borra la línea: bajar de 1 es una decisión de la pantalla, que es
    // quien avisa y ofrece deshacerlo (ver QuantityStepper con minBehavior).
    const next = Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity)));
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, quantity: next, lineTotal: lineTotalFor(item.unitPrice, next) }
          : item,
      ),
    );
  }, []);

  const removeItem = useCallback((id: string): RemovedCartLine | null => {
    const index = itemsRef.current.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const item = itemsRef.current[index];
    setItems((current) => current.filter((row) => row.id !== id));
    if (editingIdRef.current === id) setEditingId(null);

    return { item, index };
  }, []);

  const restoreItem = useCallback((removed: RemovedCartLine) => {
    setItems((current) => {
      // Devolver dos veces la misma línea (doble toque en «Deshacer») no la duplica.
      if (current.some((row) => row.id === removed.item.id)) return current;
      const next = [...current];
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      return next;
    });
  }, []);

  const beginEdit = useCallback((id: string): CartItem | null => {
    const item = itemsRef.current.find((row) => row.id === id) ?? null;
    setEditingId(item ? id : null);
    return item;
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const clear = useCallback(async () => {
    setItems([]);
    setEditingId(null);
    await cartStorage.clear();
  }, []);

  const units = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.lineTotal, 0), [items]);
  const editing = useMemo(
    () => (editingId === null ? null : (items.find((item) => item.id === editingId) ?? null)),
    [editingId, items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      units,
      subtotal,
      hydrated,
      editing,
      addItem,
      setQuantity,
      removeItem,
      restoreItem,
      beginEdit,
      cancelEdit,
      clear,
    }),
    [
      addItem,
      beginEdit,
      cancelEdit,
      clear,
      editing,
      hydrated,
      items,
      removeItem,
      restoreItem,
      setQuantity,
      subtotal,
      units,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart debe usarse dentro de CartProvider');
  return value;
}
