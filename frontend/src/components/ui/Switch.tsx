import FormControlLabel from '@mui/material/FormControlLabel';
import MuiSwitch from '@mui/material/Switch';

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/** Interruptor de producto sobre Switch de MUI, con etiqueta y descripción opcional. */
export const Switch = ({ checked, onChange, label, description, disabled, id }: SwitchProps) => (
  <FormControlLabel
    disabled={disabled}
    sx={{
      m: 0,
      width: '100%',
      justifyContent: 'space-between',
      gap: 2,
      px: 1.5,
      py: 1,
      border: '1px solid',
      borderColor: checked ? 'primary.main' : 'divider',
      bgcolor: checked ? 'action.hover' : 'background.paper',
      '& .MuiFormControlLabel-label': { flex: 1 },
    }}
    labelPlacement="start"
    label={
      label || description ? (
        <span>
          {label && <span className="block text-sm font-bold text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>}
        </span>
      ) : null
    }
    control={
      <MuiSwitch
        id={id}
        checked={checked}
        onChange={(_, nextValue) => onChange(nextValue)}
        slotProps={{ input: { 'aria-label': label ?? 'Cambiar ajuste' } }}
      />
    }
  />
);
