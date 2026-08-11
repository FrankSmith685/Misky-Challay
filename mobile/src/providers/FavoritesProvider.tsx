import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { engagementApi } from '../services/api/engagement.service';
import { mobileAnalytics } from '../services/analytics';
import type { Product } from '../types/domain';
import { useSession } from './SessionProvider';

interface FavoritesContextValue {
  products: Product[];
  ids: Set<number>;
  loading: boolean;
  reload(): Promise<void>;
  toggle(product: Product | number): Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (status !== 'authenticated') { setProducts([]); return; }
    setLoading(true);
    try { setProducts(await engagementApi.favorites()); } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { if (status === 'authenticated') void reload(); else setProducts([]); }, [reload, status]);

  const ids = useMemo(() => new Set(products.map((product) => product.id)), [products]);
  const toggle = useCallback(async (product: Product | number) => {
    if (status !== 'authenticated') throw new Error('Inicia sesión para guardar favoritos.');
    const productId = typeof product === 'number' ? product : product.id;
    const exists = products.some((item) => item.id === productId);
    if (typeof product !== 'number') setProducts((current) => exists ? current.filter((item) => item.id !== productId) : [product, ...current]);
    try {
      if (exists) await engagementApi.removeFavorite(productId); else await engagementApi.addFavorite(productId);
      if (typeof product === 'number') await reload();
      void mobileAnalytics.track(exists ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', { productId });
      return !exists;
    } catch (error) {
      await reload().catch(() => null);
      throw error;
    }
  }, [products, reload, status]);

  const value = useMemo(() => ({ products, ids, loading, reload, toggle }), [ids, loading, products, reload, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites debe usarse dentro de FavoritesProvider');
  return context;
}
