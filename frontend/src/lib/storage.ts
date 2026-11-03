let storageFailed = false;
export const hasLocalStorageFailure = () => storageFailed;
/** Persistencia sencilla en localStorage para el estado de Redux (carrito y sesion). */
export const loadState = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const saveState = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (storageFailed) { storageFailed = false; window.dispatchEvent(new Event('dulceflow:storage-restored')); }
  } catch {
    // Cuota llena o modo privado: se ignora, el estado sigue en memoria.
    storageFailed = true; window.dispatchEvent(new Event('dulceflow:storage-error'));
  }
};

export const clearState = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // sin accion
  }
};

/**
 * Rastros personales que viven fuera de Redux y deben desaparecer al cerrar sesion.
 * En un equipo compartido —locutorio, mostrador, tablet familiar— el siguiente
 * cliente veria el borrador del checkout con el nombre y el telefono del anterior,
 * y esos datos se enviarian como contacto de su pedido.
 */
const PERSONAL_KEYS = [
  'verde-bowl:state',
  'dulceflow:customer-workspace:v1',
  'verde-bowl:checkout-draft:v1',
  // La facturacion se guarda aparte del borrador (sobrevive a la compra para no
  // reteclear el RUC), asi que necesita su propia entrada aqui: el RUC y la razon
  // social identifican a una empresa y no pueden heredarse al siguiente cliente.
  'verde-bowl:checkout-billing:v1',
  'verde-bowl:builder:v2',
  'verde-bowl:purchase-context:v2',
  'verde-bowl:pending-order:v1',
  'verde-bowl.active-order.dismissed',
];

export const clearPersonalStorage = (): void => {
  PERSONAL_KEYS.forEach(clearState);
  try {
    Object.keys(localStorage).filter((key) => key.startsWith('dulceflow:cake-builder:'))
      .forEach(clearState);
    sessionStorage.removeItem('verde-bowl:builder-session');
    sessionStorage.removeItem('verde-bowl:checkout-idempotency:v1');
    sessionStorage.removeItem('dulceflow:checkout-attempt:v1');
    Object.keys(sessionStorage).filter((key) => key.startsWith('cake-visual:v1:') || key.startsWith('cake-reconstruction:v1:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // sin accion
  }
};
