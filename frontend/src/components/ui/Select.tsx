import { forwardRef } from 'react';
import MenuItem, { type MenuItemProps } from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';

interface SelectProps extends Omit<TextFieldProps, 'select' | 'error' | 'helperText'> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Selector de producto sobre MUI: accesibilidad, foco, menu y tema centralizados. */
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  ({ label, error, hint, fullWidth = true, size = 'medium', children, ...props }, ref) => (
    <TextField
      select
      inputRef={ref}
      label={label}
      error={Boolean(error)}
      helperText={error ?? hint}
      fullWidth={fullWidth}
      size={size}
      {...props}
    >
      {children}
    </TextField>
  ),
);

Select.displayName = 'Select';

/** Opcion individual del selector; evita mezclar etiquetas HTML nativas. */
export const SelectOption = (props: MenuItemProps) => <MenuItem {...props} />;
