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
import { AppState } from 'react-native';
import { invalidateResource } from '../hooks/useResource';
import { mobileAnalytics } from '../services/analytics';
import { authApi, type RegisterInput } from '../services/api/auth.service';
import { ApiRequestError, invalidateSession, onSessionExpired } from '../services/api/client';
import { notificationsApi } from '../services/api/notifications.service';
import { cartStorage } from '../services/session/cartStorage';
import { purchaseStorage } from '../services/session/purchaseStorage';
import { pushStorage } from '../services/session/pushStorage';
import { secureSession } from '../services/session/secureSession';
import type { User } from '../types/domain';

type SessionStatus = 'bootstrapping' | 'anonymous' | 'authenticated';

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  isBusy: boolean;
  /**
   * Momento en que la sesión se cayó SOLA (el refresh caducó de verdad), no
   * porque el cliente pulsara «Cerrar sesión». La capa de navegación lo mira
   * para avisar y llevar al login en vez de dejar la interfaz mintiendo.
   */
  expiredAt: number | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: RegisterInput): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Vuelve a leer al titular del servidor. Tras editar el perfil o cambiar algo
   * de la cuenta, `user` se quedaba con el valor viejo hasta el siguiente
   * arranque y cualquier pantalla que pintara `user.firstName` mentía.
   */
  refreshUser(): Promise<void>;
  requestPasswordReset(email: string): Promise<string>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Cierre de sesión global. El registro de escuchas vive en la capa de red
 * (`services/api/client`), que es quien descubre la caducidad; se reexporta aquí
 * para que las pantallas no tengan que saber de dónde sale.
 */
export { notifySessionExpired } from '../services/api/client';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('bootstrapping');
  const [user, setUser] = useState<User | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [expiredAt, setExpiredAt] = useState<number | null>(null);

  /** Copia viva del estado: los avisos de caducidad llegan fuera del render. */
  const statusRef = useRef<SessionStatus>(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /**
   * BORRADO DEL DISPOSITIVO.
   *
   * Cerrar sesión borraba solo los tokens. Seguían vivos el carrito, el contexto
   * de compra, el token push y el consentimiento e identificador de medición, que
   * además viven en variables de módulo. En un teléfono compartido eso significa
   * que la persona B queda medida porque A dijo que sí, que los avisos con el
   * número y el estado del pedido de A siguen llegando a un aparato que ya no
   * controla, y que los eventos de ambas comparten identificador.
   */
  const purgeDevice = useCallback(async () => {
    // Primero se invalida la generación de sesión: cualquier renovación en vuelo
    // que termine después de esto se descarta en vez de volver a escribir tokens
    // buenos sobre el almacén recién vaciado.
    invalidateSession();
    await secureSession.clear();

    await Promise.all([
      cartStorage.clear(),
      purchaseStorage.clear(),
      pushStorage.clear(),
      mobileAnalytics.reset(),
    ]);

    // La caché de datos guarda direcciones, pedidos y saldo del titular: se vacía
    // entera, no basta con dejar de pintarlos.
    invalidateResource();
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const stored = await secureSession.read();
      if (!stored) {
        if (active) setStatus('anonymous');
        return;
      }

      try {
        const current = await authApi.me();
        if (!active) return;
        setUser(current);
        setStatus('authenticated');
      } catch (error) {
        // Una caída de red no equivale a cerrar sesión. Solo borramos cuando el
        // servidor confirma que estas credenciales ya no sirven; entonces se va
        // todo, porque lo guardado era de la cuenta que acaba de quedar fuera.
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          await purgeDevice();
        }
        if (!active) return;
        setUser(null);
        setStatus('anonymous');
      }
    })();

    return () => {
      active = false;
    };
  }, [purgeDevice]);

  /** Caducidad real: se cierra la sesión sin hablar con el servidor (ya no escucha). */
  const handleExpired = useCallback(async () => {
    if (statusRef.current !== 'authenticated') return;
    // Marcamos ya, antes de esperar: dos avisos seguidos no purgan dos veces.
    statusRef.current = 'anonymous';

    await purgeDevice();
    setUser(null);
    setStatus('anonymous');
    setExpiredAt(Date.now());
  }, [purgeDevice]);

  useEffect(
    () =>
      onSessionExpired(() => {
        void handleExpired();
      }),
    [handleExpired],
  );

  /**
   * Red de seguridad: si la sesión murió mientras el teléfono estaba en el
   * bolsillo, al volver al primer plano ya no hay tokens que leer. Con eso basta
   * para saberlo, sin depender de que alguien nos haya avisado.
   */
  useEffect(() => {
    if (status !== 'authenticated') return;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void secureSession.read().then((stored) => {
        if (!stored) void handleExpired();
      });
    });

    return () => subscription.remove();
  }, [handleExpired, status]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsBusy(true);
    try {
      const result = await authApi.login(email.trim().toLowerCase(), password);
      await secureSession.write(result);
      setExpiredAt(null);
      setUser(result.user);
      setStatus('authenticated');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    setIsBusy(true);
    try {
      const result = await authApi.register({ ...input, email: input.email.trim().toLowerCase() });
      await secureSession.write(result);
      setExpiredAt(null);
      setUser(result.user);
      setStatus('authenticated');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsBusy(true);
    // Se marca antes de purgar: al quedarse sin tokens, el vigilante de
    // caducidad no debe confundir una salida voluntaria con una sesión caída.
    statusRef.current = 'anonymous';
    try {
      // La baja del token push y el cierre en el servidor son las últimas
      // llamadas que todavía pueden autenticarse: van antes de purgar.
      const pushToken = await pushStorage.read();
      if (pushToken) await notificationsApi.unregister(pushToken).catch(() => null);
      await authApi.logout().catch(() => null);
    } finally {
      await purgeDevice();
      setUser(null);
      setStatus('anonymous');
      setExpiredAt(null);
      setIsBusy(false);
    }
  }, [purgeDevice]);

  /**
   * Solo relee: no cierra la sesión si falla. Un corte de red mientras se
   * refresca el nombre no es motivo para echar a nadie, y el 401 de verdad ya lo
   * cazan la renovación de tokens y el aviso de caducidad.
   */
  const refreshUser = useCallback(async () => {
    if (statusRef.current !== 'authenticated') return;
    const current = await authApi.me().catch(() => null);
    if (current && statusRef.current === 'authenticated') setUser(current);
  }, []);

  const requestPasswordReset = useCallback((email: string) => authApi.forgotPassword(email), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      isBusy,
      expiredAt,
      signIn,
      signUp,
      signOut,
      refreshUser,
      requestPasswordReset,
    }),
    [
      expiredAt,
      isBusy,
      refreshUser,
      requestPasswordReset,
      signIn,
      signOut,
      signUp,
      status,
      user,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}
