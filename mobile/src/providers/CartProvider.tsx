import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cartStorage } from '../services/session/cartStorage';
import type { CartItem } from '../types/domain';

interface CartContextValue {
  items: CartItem[]; units: number; subtotal: number; hydrated: boolean;
  addItem(item: Omit<CartItem, 'id'>): void; setQuantity(id: string, quantity: number): void;
  removeItem(id: string): void; clear(): Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);
const itemId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { let active = true; void cartStorage.read().then((rows) => active && setItems(rows)).finally(() => active && setHydrated(true)); return () => { active = false; }; }, []);
  useEffect(() => { if (hydrated) void cartStorage.write(items); }, [hydrated, items]);
  const addItem = useCallback((item: Omit<CartItem, 'id'>) => setItems((current) => [...current, { ...item, id: itemId() }]), []);
  const setQuantity = useCallback((id: string, quantity: number) => setItems((current) => current.flatMap((item) => item.id !== id ? [item] : quantity <= 0 ? [] : [{ ...item, quantity: Math.min(20, quantity), lineTotal: Number((item.unitPrice * Math.min(20, quantity)).toFixed(2)) }])), []);
  const removeItem = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const clear = useCallback(async () => { setItems([]); await cartStorage.clear(); }, []);
  const units = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.lineTotal, 0), [items]);
  const value = useMemo(() => ({ items, units, subtotal, hydrated, addItem, setQuantity, removeItem, clear }), [addItem, clear, hydrated, items, removeItem, setQuantity, subtotal, units]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart debe usarse dentro de CartProvider');
  return value;
}
