import { Store } from 'lucide-react';
import InputAdornment from '@mui/material/InputAdornment';
import { Select, SelectOption } from '@components/ui/Select';
import type { Branch } from '@features/geo/types';

interface BranchSelectorProps {
  value: number | null;
  branches: Branch[];
  onChange: (branchId: number) => void;
}

export const BranchSelector = ({ value, branches, onChange }: BranchSelectorProps) => (
  <Select
    aria-label="Cocina activa"
    value={value ?? ''}
    onChange={(event) => onChange(Number(event.target.value))}
    sx={{ minWidth: { xs: '100%', sm: 230 }, bgcolor: 'background.paper' }}
    slotProps={{
      input: {
        startAdornment: <InputAdornment position="start"><Store size={17} /></InputAdornment>,
      },
    }}
  >
      {branches.length === 0 && <SelectOption value="" disabled>Sin cocinas disponibles</SelectOption>}
      {branches.map((branch) => (
        <SelectOption key={branch.id} value={branch.id}>{branch.name}</SelectOption>
      ))}
  </Select>
);
