import { Store } from 'lucide-react';
import InputAdornment from '@mui/material/InputAdornment';
import { Select, SelectOption } from '@components/ui/Select';
import type { Branch } from '@features/geo/types';

interface BranchSelectorProps {
  value: number | null;
  branches: Branch[];
  onChange: (branchId: number) => void;
  allowAll?: boolean;
  onSelectAll?: () => void;
  /**
   * true cuando la carga de cocinas fallo (`branchesError` de useActiveBranch).
   * Sin esto la lista vacia decia "Sin cocinas disponibles", que es una mentira
   * distinta a "no pudimos preguntar".
   */
  hasError?: boolean;
  disabled?: boolean;
}

export const BranchSelector = ({ value, branches, onChange, allowAll = false, onSelectAll, hasError, disabled }: BranchSelectorProps) => (
  <Select
    aria-label={allowAll ? 'Alcance del resumen' : 'Cocina activa'}
    label={allowAll ? 'Alcance' : 'Sucursal operativa'}
    disabled={disabled}
    value={allowAll && value === null ? '__all__' : value ?? ''}
    fullWidth={false}
    onChange={(event) => {
      if (event.target.value === '__all__') { onSelectAll?.(); return; }
      onChange(Number(event.target.value));
    }}
    sx={{ width: { xs: '100%', sm: 230 }, minWidth: 0, maxWidth: '100%', flexShrink: 1, bgcolor: 'background.paper' }}
    slotProps={{
      input: {
        startAdornment: <InputAdornment position="start"><Store size={17} /></InputAdornment>,
      },
    }}
  >
      {allowAll && <SelectOption value="__all__">Todas las sucursales</SelectOption>}
      {branches.length === 0 && (
        <SelectOption value="" disabled>
          {hasError ? 'No se pudieron cargar las cocinas' : 'Sin cocinas disponibles'}
        </SelectOption>
      )}
      {branches.map((branch) => (
        <SelectOption key={branch.id} value={branch.id}>{branch.name}</SelectOption>
      ))}
  </Select>
);
