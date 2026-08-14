import { useCallback, useEffect, useMemo, useState } from 'react';
import { geoApi } from '@features/geo/services/geo.service';
import type { Branch } from '@features/geo/types';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@/hooks/usePermissions';

const STORAGE_KEY = 'verde-bowl.admin.active-branch';

/**
 * Resuelve la cocina activa respetando las sucursales asignadas al usuario.
 *
 * El error de carga se DEVUELVE, no se traga. Antes un `.catch(() => setAllBranches([]))`
 * dejaba `branchId = null` y la pantalla de Cocina fabricaba un tablero vacio en el
 * cliente sin llegar a llamar al servidor: "Cocina al dia · No hay pedidos
 * pendientes" cuando lo que fallaba era la red. Con `branchesError` la pantalla
 * puede pintar LoadError y ofrecer `reloadBranches`.
 */
export const useActiveBranch = () => {
  const { branchIds, isSuperAdmin } = usePermissions();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  });
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const reloadBranches = useCallback(async () => {
    setIsLoadingBranches(true);
    try {
      setAllBranches(await geoApi.getBranches());
      setBranchesError(null);
    } catch (error) {
      setAllBranches([]);
      setBranchesError(getApiErrorMessage(error));
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    void reloadBranches();
  }, [reloadBranches]);

  const branches = useMemo(
    () =>
      isSuperAdmin || branchIds.length === 0
        ? allBranches
        : allBranches.filter((branch) => branchIds.includes(branch.id)),
    [allBranches, branchIds, isSuperAdmin],
  );

  useEffect(() => {
    if (branches.length === 0) {
      setBranchIdState(null);
      return;
    }
    if (!branchId || !branches.some((branch) => branch.id === branchId)) {
      setBranchIdState(branches[0].id);
      localStorage.setItem(STORAGE_KEY, String(branches[0].id));
    }
  }, [branchId, branches]);

  const setBranchId = (next: number) => {
    setBranchIdState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return {
    branchId,
    branches,
    setBranchId,
    isLoadingBranches,
    /** Mensaje del fallo al cargar las cocinas. Null si todo fue bien. */
    branchesError,
    /** Reintento para el boton de LoadError. */
    reloadBranches,
  };
};
