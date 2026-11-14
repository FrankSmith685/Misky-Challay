import { forwardRef } from 'react';
import MenuItem, { type MenuItemProps } from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import type { SxProps, Theme } from '@mui/material/styles';

interface SelectProps extends Omit<TextFieldProps, 'select' | 'error' | 'helperText'> {
  label?: string;
  error?: string;
  hint?: string;
}

const selectAppearance: SxProps<Theme> = {
  '& .MuiOutlinedInput-root': {
    minHeight: 44,
    borderRadius: 'var(--radius-field)',
    backgroundColor: 'var(--color-surface)',
  },
  '& .MuiOutlinedInput-root.MuiInputBase-sizeSmall': { minHeight: 44 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--color-line)' },
  '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
  '& .MuiSelect-icon': { right: 14, fontSize: 20, color: 'var(--color-ink-muted)' },
};

/** Apariencia del selector compartida por todos los usos de Select. */
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  ({ label, error, hint, fullWidth = true, size = 'medium', children, sx, ...props }, ref) => (
    <TextField
      select
      inputRef={ref}
      label={label}
      error={Boolean(error)}
      helperText={error ?? hint}
      fullWidth={fullWidth}
      size={size}
      {...props}
      sx={[selectAppearance, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      {children}
    </TextField>
  ),
);

Select.displayName = 'Select';

/** Opcion individual del selector; evita mezclar etiquetas HTML nativas. */
export const SelectOption = (props: MenuItemProps) => <MenuItem {...props} />;
