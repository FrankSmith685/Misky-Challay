import { Store } from 'lucide-react';
import InputAdornment from '@mui/material/InputAdornment';
import { Select, SelectOption } from '@components/ui/Select';
import type { Branch } from '@features/geo/types';

interface BranchSelectorProps {
  value: number | null;
  branches: Branch[];
  onChange: (branchId: number) => void;
  /**
   * true cuando la carga de cocinas fallo (`branchesError` de useActiveBranch).
   * Sin esto la lista vacia decia "Sin cocinas disponibles", que es una mentira
   * distinta a "no pudimos preguntar".
   */
  hasError?: boolean;
  disabled?: boolean;
}

export const BranchSelector = ({ value, branches, onChange, hasError, disabled }: BranchSelectorProps) => (
  <Select
    aria-label="Cocina activa"
    label="Sucursal operativa"
    disabled={disabled}
    value={value ?? ''}
    fullWidth={false}
    onChange={(event) => onChange(Number(event.target.value))}
    sx={{ width: { xs: '100%', sm: 230 }, minWidth: 0, maxWidth: '100%', flexShrink: 1, bgcolor: 'background.paper' }}
    slotProps={{
      input: {
        startAdornment: <InputAdornment position="start"><Store size={17} /></InputAdornment>,
      },
    }}
  >
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
