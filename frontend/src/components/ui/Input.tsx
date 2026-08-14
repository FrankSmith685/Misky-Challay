import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  /** Conserva el alto del mensaje para evitar saltos cuando aparece una validación. */
  reserveHelperSpace?: boolean;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      reserveHelperSpace = false,
      startAdornment,
      endAdornment,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? props.name;
    const {
      onChange,
      onBlur,
      name,
      value,
      defaultValue,
      type,
      disabled,
      required,
      autoComplete,
      autoFocus,
      placeholder,
      ...htmlInputProps
    } = props;

    return (
      <TextField
        id={inputId}
        inputRef={ref}
        label={label}
        error={Boolean(error)}
        helperText={error ?? hint ?? (reserveHelperSpace ? ' ' : undefined)}
        fullWidth
        className={className}
        name={name}
        value={value}
        defaultValue={defaultValue}
        type={type}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={onBlur}
        slotProps={{
          formHelperText: reserveHelperSpace
            ? {
                sx: {
                  minHeight: 20,
                  mt: 1,
                  mb: 0,
                  lineHeight: 1.45,
                },
              }
            : undefined,
          input: {
            startAdornment: startAdornment ? (
              <InputAdornment position="start">{startAdornment}</InputAdornment>
            ) : undefined,
            endAdornment: endAdornment ? (
              <InputAdornment position="end">{endAdornment}</InputAdornment>
            ) : undefined,
          },
          htmlInput: { ...htmlInputProps, 'aria-invalid': Boolean(error) },
        }}
      />
    );
  },
);

Input.displayName = 'Input';
