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
import { engagementApi } from '../services/api/engagement.service';
import { mobileAnalytics } from '../services/analytics';
import type { Product } from '../types/domain';
import { useSession } from './SessionProvider';

export interface FavoritesContextValue {
  products: Product[];
  ids: Set<number>;
  /** Primera carga, sin nada que pintar todavía: toca esqueleto. */
  loading: boolean;
  /** Ya hay lista en pantalla y se está revalidando: toca RefreshControl. */
  refreshing: boolean;
  /**
   * La lista NO se pudo leer. Es distinto de una lista vacía y hay que
   * pintarlo distinto: antes un fallo de red se veía igual que «no tienes
   * favoritos», que es mentirle al cliente sobre lo que hay en su cuenta.
   */
  error: string | null;
  reload(): Promise<void>;
  toggle(product: Product | number): Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const readMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'No pudimos cargar tus favoritos.';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cada carga lleva número. Si el cliente cierra sesión o refresca dos veces
   * seguidas, solo la respuesta de la última puede escribir en pantalla.
   */
  const requestId = useRef(0);
  /** Si ya llegó a haber una lista, revalidar es refrescar, no cargar de cero. */
  const everLoaded = useRef(false);
  /**
   * Copia viva de la lista para `toggle`. Sin ella, `toggle` se queda con los
   * favoritos que había cuando se creó, y una acción diferida —el «Deshacer» del
   * aviso— volvía a quitar el plato en vez de devolverlo.
   */
  const productsRef = useRef<Product[]>([]);

  const reload = useCallback(async () => {
    if (status !== 'authenticated') {
      requestId.current += 1;
      everLoaded.current = false;
      setProducts([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const id = (requestId.current += 1);
    if (everLoaded.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const list = await engagementApi.favorites();
      if (id !== requestId.current) return;
      setProducts(list);
      everLoaded.current = true;
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(readMessage(caught));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const ids = useMemo(() => new Set(products.map((product) => product.id)), [products]);

  const toggle = useCallback(
    async (product: Product | number) => {
      if (status !== 'authenticated') throw new Error('Inicia sesión para guardar favoritos.');

      const productId = typeof product === 'number' ? product : product.id;
      const exists = productsRef.current.some((item) => item.id === productId);

      // Con el producto entero delante podemos pintar el cambio antes de que
      // conteste el servidor; con solo el identificador hay que recargar.
      if (typeof product !== 'number') {
        setProducts((current) =>
          exists ? current.filter((item) => item.id !== productId) : [product, ...current],
        );
      }

      try {
        if (exists) await engagementApi.removeFavorite(productId);
        else await engagementApi.addFavorite(productId);

        if (typeof product === 'number') await reload();
        void mobileAnalytics.track(exists ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', { productId });
        return !exists;
      } catch (caught) {
        // El cambio optimista ya no vale: volvemos a preguntar por la lista real
        // y dejamos que la pantalla avise de lo que pasó.
        await reload();
        throw caught;
      }
    },
    [reload, status],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ products, ids, loading, refreshing, error, reload, toggle }),
    [error, ids, loading, products, refreshing, reload, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites debe usarse dentro de FavoritesProvider');
  return context;
}
