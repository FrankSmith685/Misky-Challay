import { forwardRef, type InputHTMLAttributes } from 'react';
import TextField from '@mui/material/TextField';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
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
        helperText={error ?? hint}
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
        slotProps={{ htmlInput: { ...htmlInputProps, 'aria-invalid': Boolean(error) } }}
      />
    );
  },
);

Input.displayName = 'Input';
