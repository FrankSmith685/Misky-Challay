import { useEffect, useState } from 'react';
import { useAppSelector } from '@app/hooks';
import { plansApi } from '@features/plans/services/plans.service';

/**
 * SALDO DISPONIBLE, UNA SOLA PETICION POR SESION
 * ---------------------------------------------------------------------------
 * El saldo tiene que verse antes del ultimo paso del checkout (menu de usuario,
 * drawer movil, carrito). Con un `useEffect` por consumidor, cada montaje pediria
 * el monedero otra vez y una misma pantalla con dos consumidores lo pediria dos
 * veces por render de cabecera.
 *
 * Por eso el estado vive FUERA de React: una peticion por usuario identificado,
 * compartida por todos los que la escuchan. Cerrar sesion invalida la cache para
 * que el siguiente login no herede el saldo del anterior.
 *
 * El fallo NO se propaga: el saldo es informacion complementaria, asi que un 500
 * o un 403 devuelven `null` (no se muestra nada) en vez de romper la cabecera.
 */
export interface WalletBalance {
  balance: number | null;
  isLoading: boolean;
}

const GUEST: WalletBalance = { balance: null, isLoading: false };

/** Usuario al que pertenece la cache; `null` = sin sesion o sin pedir todavia. */
let cachedFor: number | null = null;
let snapshot: WalletBalance = GUEST;
const listeners = new Set<() => void>();

const publish = (next: WalletBalance) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

/** Lo que le toca ver a un consumidor: la cache solo vale para SU usuario. */
const read = (userId: number | null): WalletBalance => {
  if (userId === null) return GUEST;
  return cachedFor === userId ? snapshot : { balance: null, isLoading: true };
};

const load = (userId: number) => {
  if (cachedFor === userId) return;
  cachedFor = userId;
  publish({ balance: null, isLoading: true });

  void plansApi
    .wallet()
    .then((wallet) => {
      // Cambio de sesion mientras la peticion viajaba: esta respuesta ya no es suya.
      if (cachedFor !== userId) return;
      publish({
        balance: typeof wallet.balance === 'number' && Number.isFinite(wallet.balance)
          ? wallet.balance
          : null,
        isLoading: false,
      });
    })
    .catch(() => {
      if (cachedFor !== userId) return;
      publish({ balance: null, isLoading: false });
    });
};

export const useWalletBalance = (): WalletBalance => {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const [state, setState] = useState<WalletBalance>(() => read(userId));

  useEffect(() => {
    if (userId === null) {
      if (cachedFor !== null) {
        cachedFor = null;
        publish(GUEST);
      }
      setState(GUEST);
      return;
    }

    const sync = () => setState(read(userId));
    listeners.add(sync);
    load(userId);
    sync();

    return () => {
      listeners.delete(sync);
    };
  }, [userId]);

  return state;
};
