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
  } catch {
    // Cuota llena o modo privado: se ignora, el estado sigue en memoria.
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
  'verde-bowl:checkout-draft:v1',
  // La facturacion se guarda aparte del borrador (sobrevive a la compra para no
  // reteclear el RUC), asi que necesita su propia entrada aqui: el RUC y la razon
  // social identifican a una empresa y no pueden heredarse al siguiente cliente.
  'verde-bowl:checkout-billing:v1',
  'verde-bowl:builder:v2',
  'verde-bowl:purchase-context:v2',
];

export const clearPersonalStorage = (): void => {
  PERSONAL_KEYS.forEach(clearState);
  try {
    sessionStorage.removeItem('verde-bowl:builder-session');
  } catch {
    // sin accion
  }
};
