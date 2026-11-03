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
import { accountApi } from '../services/api/account.service';
import { geoApi } from '../services/api/geo.service';
import { purchaseStorage } from '../services/session/purchaseStorage';
import { useSession } from './SessionProvider';
import type { Address, Branch, CoverageResult, ServiceMode } from '../types/domain';

/**
 * Contexto de compra: cómo y dónde recibe el cliente.
 *
 * La sede no es una preferencia decorativa: decide qué carta se ve, qué está
 * disponible y qué cocina prepara. En delivery el cliente no la elige, la decide
 * la cobertura de su dirección — la misma regla que aplica la web al validar
 * cobertura. Por eso aquí viven juntas la dirección vigente, su cobertura
 * resuelta y la sede que sale de ella.
 *
 * Antes se borraba la sede al entrar en delivery (el modo por defecto), así que
 * el menú pedía productos sin `branchId` y todo aparecía disponible: el choque
 * llegaba al cotizar, con el carrito ya lleno.
 */
interface PurchaseContextValue {
  serviceMode: ServiceMode;
  /** Sede que atiende: elegida en recojo/salón, resuelta por cobertura en delivery. */
  branch: Branch | null;
  branches: Branch[];
  /** Dirección de entrega vigente. Solo tiene sentido en delivery. */
  address: Address | null;
  /** Cobertura de esa dirección: tarifa, mínimo, ETA y sede asignada. */
  coverage: CoverageResult | null;
  isLoading: boolean;
  /** Hay una consulta de cobertura en curso: la sede aún puede cambiar. */
  isResolvingCoverage: boolean;
  error: string | null;
  setServiceMode(mode: ServiceMode): void;
  selectBranch(branchId: number): void;
  /**
   * Fija la dirección de entrega, consulta la cobertura y asigna la sede.
   * Pasa `knownCoverage` cuando acabas de validarla (el alta de dirección ya la
   * tiene) para no preguntar dos veces lo mismo.
   * Propaga el error de red: quien llama decide si avisa con un toast.
   */
  selectDeliveryAddress(
    address: Address | null,
    knownCoverage?: CoverageResult | null,
  ): Promise<CoverageResult | null>;
  /** Vuelve a consultar la cobertura de la dirección vigente (RN-001: nunca se cachea). */
  refreshCoverage(): Promise<CoverageResult | null>;
  /** Aplica una cobertura ya resuelta sin dirección guardada (pantalla pública). */
  applyCoverage(result: CoverageResult): void;
  reloadBranches(): Promise<void>;
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

/** El delivery se cotiza desde el punto exacto para incluir recargos por distancia. */
const coverageQuery = (
  address: Address,
): { districtId?: number; latitude?: number; longitude?: number } | null => {
  const hasPoint = address.latitude !== null && address.longitude !== null;
  if (!hasPoint) return null;
  return {
    districtId: address.districtId ?? undefined,
    latitude: address.latitude ?? undefined,
    longitude: address.longitude ?? undefined,
  };
};

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();

  const [serviceMode, setMode] = useState<ServiceMode>('DELIVERY');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolvingCoverage, setIsResolvingCoverage] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /**
   * El contexto del servidor ya se leyó (o se intentó). Hasta entonces no se
   * escribe nada: si no, el arranque del teléfono pisaría con su estado local lo
   * que el cliente acabase de elegir en la web.
   */
  const [remoteRead, setRemoteRead] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Una consulta de cobertura lenta no puede pisar una selección más reciente:
   * cada llamada se queda con su turno y solo escribe si sigue siendo el último.
   */
  const coverageTurn = useRef(0);
  /** Última cobertura conocida, legible desde callbacks sin recrearlos en cada render. */
  const coverageRef = useRef<CoverageResult | null>(null);
  const addressRef = useRef<Address | null>(null);
  /** Huella de lo último que se envió al servidor, para no repetir el mismo PUT. */
  const syncedRef = useRef<string | null>(null);
  const previousStatus = useRef(status);

  coverageRef.current = coverage;
  addressRef.current = address;

  const reloadBranches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setBranches(await geoApi.branches());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cargar los locales.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Arranque: lo guardado en el dispositivo pinta la pantalla sin esperar a la red.
  useEffect(() => {
    let active = true;

    void Promise.all([purchaseStorage.read(), geoApi.branches()])
      .then(([stored, rows]) => {
        if (!active) return;
        setBranches(rows);
        if (stored) {
          setMode(stored.serviceMode);
          setBranchId(stored.branchId);
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'No pudimos cargar los locales.');
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void purchaseStorage.write({ serviceMode, branchId, addressId: address?.id ?? null });
  }, [address?.id, branchId, hydrated, serviceMode]);

  /**
   * Consulta la cobertura de una dirección y devuelve la sede que le toca.
   * Escribe el estado solo si sigue siendo la selección vigente.
   */
  const resolveCoverage = useCallback(async (target: Address): Promise<CoverageResult | null> => {
    const query = coverageQuery(target);
    if (!query) {
      setCoverage(null);
      setBranchId(null);
      return null;
    }

    coverageTurn.current += 1;
    const turn = coverageTurn.current;
    setIsResolvingCoverage(true);

    try {
      const result = await geoApi.coverage(query);
      if (turn !== coverageTurn.current) return result;

      setCoverage(result);
      // Fuera de cobertura no hay cocina que asignar: mejor sin sede que con una
      // sede que luego rechazará el pedido.
      setBranchId(result.covered ? (result.branch?.id ?? null) : null);
      return result;
    } finally {
      if (turn === coverageTurn.current) setIsResolvingCoverage(false);
    }
  }, []);

  const selectDeliveryAddress = useCallback(
    async (
      next: Address | null,
      knownCoverage?: CoverageResult | null,
    ): Promise<CoverageResult | null> => {
      setMode('DELIVERY');
      setAddress(next);

      if (!next) {
        coverageTurn.current += 1; // descarta cualquier consulta en vuelo
        setCoverage(null);
        setBranchId(null);
        return null;
      }

      if (knownCoverage) {
        coverageTurn.current += 1;
        setCoverage(knownCoverage);
        setBranchId(knownCoverage.covered ? (knownCoverage.branch?.id ?? null) : null);
        return knownCoverage;
      }

      return resolveCoverage(next);
    },
    [resolveCoverage],
  );

  const refreshCoverage = useCallback(async (): Promise<CoverageResult | null> => {
    const current = addressRef.current;
    if (!current) return null;
    return resolveCoverage(current);
  }, [resolveCoverage]);

  const applyCoverage = useCallback((result: CoverageResult) => {
    coverageTurn.current += 1;
    setMode('DELIVERY');
    setCoverage(result);
    setBranchId(result.covered ? (result.branch?.id ?? null) : null);
  }, []);

  const setServiceMode = useCallback((mode: ServiceMode) => {
    setMode(mode);
    // Al volver a delivery la sede vuelve a ser la que dictó la cobertura, no la
    // que el cliente hubiera elegido para recoger.
    if (mode === 'DELIVERY') {
      const covered = coverageRef.current;
      setBranchId(covered?.covered ? (covered.branch?.id ?? null) : null);
    }
  }, []);

  const selectBranch = useCallback((nextBranchId: number) => {
    setBranchId(nextBranchId);
  }, []);

  /**
   * Rehidratación desde el servidor: la sede y la modalidad viajan entre la web
   * y el teléfono. El contexto remoto nunca trae cobertura (RN-001), así que la
   * dirección que llega se vuelve a validar aquí antes de darla por buena.
   */
  useEffect(() => {
    if (!hydrated || status !== 'authenticated') return;

    let active = true;
    setRemoteRead(false);

    void (async () => {
      try {
        const remote = await accountApi.purchaseContext();
        if (!active || remote.source === 'EMPTY') return;

        // Una sugerencia del servidor («tu dirección principal») no pisa lo que
        // el cliente acaba de elegir en este teléfono; una selección real, sí.
        if (remote.source === 'DEFAULT_ADDRESS' && addressRef.current) return;

        syncedRef.current = `${remote.deliveryType}:${remote.branch?.id ?? ''}:${remote.address?.id ?? ''}`;
        setMode(remote.deliveryType);

        if (remote.deliveryType === 'PICKUP') {
          setAddress(null);
          setCoverage(null);
          setBranchId(remote.branch?.id ?? null);
          return;
        }

        setAddress(remote.address);
        if (remote.address) await resolveCoverage(remote.address);
        else setBranchId(remote.branch?.id ?? null);
      } catch {
        // El contexto remoto es una comodidad: si falla, manda lo guardado aquí.
      } finally {
        // Aunque falle: un servidor caído no puede dejar la app sin poder guardar.
        if (active) setRemoteRead(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [hydrated, resolveCoverage, status]);

  /** Cada cambio real viaja al servidor para que el navegador lo encuentre puesto. */
  useEffect(() => {
    if (!hydrated || !remoteRead || status !== 'authenticated') return;
    // El backend solo conoce delivery y recojo; comer en salón es de este dispositivo.
    if (serviceMode === 'DINE_IN') return;

    const signature = `${serviceMode}:${branchId ?? ''}:${address?.id ?? ''}`;
    if (signature === syncedRef.current) return;
    syncedRef.current = signature;

    void accountApi
      .savePurchaseContext({
        deliveryType: serviceMode,
        branchId,
        addressId: serviceMode === 'DELIVERY' ? (address?.id ?? null) : null,
      })
      .catch(() => {
        // Reintentar en el próximo cambio: guardar el contexto nunca bloquea la compra.
        syncedRef.current = null;
      });
  }, [address?.id, branchId, hydrated, remoteRead, serviceMode, status]);

  /*
   * Al cerrar sesión, la dirección y su cobertura dejan de ser de nadie.
   *
   * La modalidad también vuelve a su valor por defecto: `SessionProvider` borra
   * `purchaseStorage`, pero el efecto de escritura de aquí arriba lo reescribe
   * enseguida con la modalidad del titular anterior. No es un dato sensible, pero
   * dejaba el teléfono con la elección de otra persona y contradecía la purga.
   */
  useEffect(() => {
    const wasAuthenticated = previousStatus.current === 'authenticated';
    previousStatus.current = status;
    if (!wasAuthenticated || status !== 'anonymous') return;

    coverageTurn.current += 1;
    syncedRef.current = null;
    setRemoteRead(false);
    setAddress(null);
    setCoverage(null);
    setMode('DELIVERY');
    setBranchId(null);
  }, [status]);

  const branch = useMemo(
    () => branches.find((item) => item.id === branchId) ?? null,
    [branchId, branches],
  );

  const value = useMemo<PurchaseContextValue>(
    () => ({
      serviceMode,
      branch,
      branches,
      address,
      coverage,
      isLoading,
      isResolvingCoverage,
      error,
      setServiceMode,
      selectBranch,
      selectDeliveryAddress,
      refreshCoverage,
      applyCoverage,
      reloadBranches,
    }),
    [
      address,
      applyCoverage,
      branch,
      branches,
      coverage,
      error,
      isLoading,
      isResolvingCoverage,
      refreshCoverage,
      reloadBranches,
      selectBranch,
      selectDeliveryAddress,
      serviceMode,
      setServiceMode,
    ],
  );

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase() {
  const context = useContext(PurchaseContext);
  if (!context) throw new Error('usePurchase debe usarse dentro de PurchaseProvider');
  return context;
}
