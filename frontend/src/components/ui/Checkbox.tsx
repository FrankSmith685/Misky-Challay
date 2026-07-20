import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import MuiCheckbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'color'> {
  label?: ReactNode;
}

/** Casilla de verificacion con marca en el verde de marca. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, ...props }, ref) => {
    const checkboxId = id ?? props.name;
    const { checked, defaultChecked, disabled, required, name, value, onChange, readOnly, autoFocus, ...inputProps } = props;

    return (
      <FormControlLabel
        className={className}
        sx={{ m: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { pt: .75, fontSize: 14 } }}
        label={label ?? ''}
        control={
          <MuiCheckbox
            id={checkboxId}
            checked={checked}
            defaultChecked={defaultChecked}
            disabled={disabled}
            required={required}
            name={name}
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            autoFocus={autoFocus}
            size="small"
            slotProps={{ input: { ref, ...inputProps } }}
          />
        }
      />
    );
  },
);

Checkbox.displayName = 'Checkbox';
