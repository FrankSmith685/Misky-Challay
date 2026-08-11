import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { geoApi } from '../services/api/geo.service';
import { purchaseStorage } from '../services/session/purchaseStorage';
import type { Branch, ServiceMode } from '../types/domain';

interface PurchaseContextValue {
  serviceMode: ServiceMode;
  branch: Branch | null;
  branches: Branch[];
  isLoading: boolean;
  error: string | null;
  setServiceMode(mode: ServiceMode): void;
  selectBranch(branchId: number): void;
  reloadBranches(): Promise<void>;
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const [serviceMode, setMode] = useState<ServiceMode>('DELIVERY');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No pudimos cargar los locales.');
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
          setHydrated(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void purchaseStorage.write({ serviceMode, branchId });
  }, [branchId, hydrated, serviceMode]);

  const setServiceMode = useCallback((mode: ServiceMode) => {
    setMode(mode);
    if (mode === 'DELIVERY') setBranchId(null);
  }, []);
  const selectBranch = useCallback((nextBranchId: number) => setBranchId(nextBranchId), []);
  const branch = useMemo(() => branches.find((item) => item.id === branchId) ?? null, [branchId, branches]);

  const value = useMemo<PurchaseContextValue>(() => ({
    serviceMode, branch, branches, isLoading, error, setServiceMode, selectBranch, reloadBranches,
  }), [branch, branches, error, isLoading, reloadBranches, selectBranch, serviceMode, setServiceMode]);

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase() {
  const context = useContext(PurchaseContext);
  if (!context) throw new Error('usePurchase debe usarse dentro de PurchaseProvider');
  return context;
}
