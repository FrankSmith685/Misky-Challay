import { useEffect, useMemo, useState } from 'react';
import { geoApi } from '@features/geo/services/geo.service';
import type { Branch } from '@features/geo/types';
import { usePermissions } from '@/hooks/usePermissions';

const STORAGE_KEY = 'verde-bowl.admin.active-branch';

/** Resuelve la cocina activa respetando las sucursales asignadas al usuario. */
export const useActiveBranch = () => {
  const { branchIds, isSuperAdmin } = usePermissions();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  });
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);

  useEffect(() => {
    geoApi
      .getBranches()
      .then(setAllBranches)
      .catch(() => setAllBranches([]))
      .finally(() => setIsLoadingBranches(false));
  }, []);

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

  return { branchId, branches, setBranchId, isLoadingBranches };
};
