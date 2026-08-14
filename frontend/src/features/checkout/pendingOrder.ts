/**
 * EL PEDIDO QUE QUEDO A MEDIO PAGAR
 * ---------------------------------------------------------------------------
 * Al pulsar "Pagar", el backend CREA el pedido (PENDING_PAYMENT) y solo despues
 * se redirige a la pasarela. Desde ese instante el carrito ya no es la verdad: lo
 * es el pedido, que ademas tiene reservado el stock, el cupon y el saldo. Por eso
 * el carrito se vacia ahi mismo, y no al confirmarse el pago.
 *
 * El problema era lo que pasaba si el cliente no terminaba de pagar: cerraba la
 * pestana o pulsaba atras y aterrizaba en un carrito vacio, sin rastro del pedido
 * ni forma de pagarlo o cancelarlo.
 *
 * Aqui se guarda esa referencia para poder ofrecersela de vuelta. Vive en
 * localStorage (no en sessionStorage) porque volver de la pasarela puede abrir
 * una pestana nueva.
 */

const KEY = 'verde-bowl:pending-order:v1';
/** Pasado un dia, la sesion de pago de la pasarela ya no sirve. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingOrderRef {
  orderNumber: string;
  /** Marca de tiempo de la redireccion, para no ofrecer sesiones de pago muertas. */
  createdAt: number;
}

export const rememberPendingOrder = (orderNumber: string): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ orderNumber, createdAt: Date.now() }));
  } catch {
    // Modo privado o cuota llena: se pierde el atajo, no el pedido.
  }
};

export const readPendingOrder = (): PendingOrderRef | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingOrderRef | null;
    if (!saved?.orderNumber || typeof saved.createdAt !== 'number') return null;
    if (Date.now() - saved.createdAt > MAX_AGE_MS) {
      forgetPendingOrder();
      return null;
    }
    return saved;
  } catch {
    forgetPendingOrder();
    return null;
  }
};

export const forgetPendingOrder = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // sin accion
  }
};
