import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * CONTEXT DE EXPERIENCIA (useAppState)
 * -----------------------------------------------------------------------
 * Contexto ligero para el "contexto de compra" del visitante: ciudad,
 * direccion, sucursal asignada, modalidad y franja horaria. Casi toda la app
 * lo lee (menu, builder, carrito, checkout) y cambia poco.
 *
 * Regla del proyecto:
 *   - useAppState (Context) -> contexto de compra + preferencias de UI.
 *   - Redux                 -> sesion, carrito, catalogo (datos del dominio).
 *   - useState              -> estado local de un componente.
 */

export type DeliveryType = 'DELIVERY' | 'PICKUP';
export type ServiceMode = 'ASAP' | 'SCHEDULED';

export interface SelectedAddress {
  id?: number;
  label: string;
  line1: string;
  latitude?: number;
  longitude?: number;
  districtId?: number;
  reference?: string;
}

export interface AppState {
  cityId: number | null;
  address: SelectedAddress | null;
  branchId: number | null;
  deliveryType: DeliveryType;
  serviceMode: ServiceMode;
  scheduledSlotId: number | null;
  isCartOpen: boolean;
  isLocationModalOpen: boolean;
}

export interface AppStateContextValue extends AppState {
  setCity: (cityId: number | null) => void;
  setAddress: (address: SelectedAddress | null) => void;
  setBranch: (branchId: number | null) => void;
  setDeliveryType: (type: DeliveryType) => void;
  setServiceMode: (mode: ServiceMode) => void;
  setScheduledSlot: (slotId: number | null) => void;
  openCart: () => void;
  closeCart: () => void;
  openLocationModal: () => void;
  closeLocationModal: () => void;
  reset: () => void;
  /** RN-001: sin cobertura confirmada no se debe permitir avanzar al checkout. */
  hasCoverage: boolean;
}

const INITIAL_STATE: AppState = {
  cityId: null,
  address: null,
  branchId: null,
  deliveryType: 'DELIVERY',
  serviceMode: 'ASAP',
  scheduledSlotId: null,
  isCartOpen: false,
  isLocationModalOpen: false,
};

const APP_STATE_KEY = 'verde-bowl:purchase-context:v2';

const restoreState = (): AppState => {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_STATE_KEY) ?? 'null') as Partial<AppState> | null;
    if (!saved) return INITIAL_STATE;
    return {
      ...INITIAL_STATE,
      cityId: typeof saved.cityId === 'number' ? saved.cityId : null,
      address: saved.address?.line1 ? saved.address : null,
      branchId: typeof saved.branchId === 'number' ? saved.branchId : null,
      deliveryType: saved.deliveryType === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
      serviceMode: saved.serviceMode === 'SCHEDULED' ? 'SCHEDULED' : 'ASAP',
      scheduledSlotId: typeof saved.scheduledSlotId === 'number' ? saved.scheduledSlotId : null,
    };
  } catch {
    localStorage.removeItem(APP_STATE_KEY);
    return INITIAL_STATE;
  }
};

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(restoreState);

  useEffect(() => {
    const persistent = {
      cityId: state.cityId,
      address: state.address,
      branchId: state.branchId,
      deliveryType: state.deliveryType,
      serviceMode: state.serviceMode,
      scheduledSlotId: state.scheduledSlotId,
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(persistent));
  }, [state]);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((current) => ({ ...current, ...partial }));
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...state,
      hasCoverage: state.branchId !== null && (state.deliveryType === 'PICKUP' || !!state.address),
      setCity: (cityId) => patch({ cityId, branchId: null }),
      setAddress: (address) => patch({ address }),
      setBranch: (branchId) => patch({ branchId }),
      setDeliveryType: (deliveryType) => patch({ deliveryType }),
      setServiceMode: (serviceMode) => patch({ serviceMode, scheduledSlotId: null }),
      setScheduledSlot: (scheduledSlotId) => patch({ scheduledSlotId }),
      openCart: () => patch({ isCartOpen: true }),
      closeCart: () => patch({ isCartOpen: false }),
      openLocationModal: () => patch({ isLocationModalOpen: true }),
      closeLocationModal: () => patch({ isLocationModalOpen: false }),
      reset: () => setState(INITIAL_STATE),
    }),
    [state, patch],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppState = (): AppStateContextValue => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState debe usarse dentro de <AppStateProvider>');
  }
  return context;
};
