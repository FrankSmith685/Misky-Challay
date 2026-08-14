import { forwardRef, type TextareaHTMLAttributes } from 'react';
import TextField from '@mui/material/TextField';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Campo multilinea de producto sobre MUI, con el mismo tema, foco y errores que Input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, rows = 4, ...props }, ref) => {
    const textareaId = id ?? props.name;
    const {
      onChange,
      onBlur,
      name,
      value,
      defaultValue,
      disabled,
      required,
      autoFocus,
      placeholder,
      maxLength,
      minLength,
      readOnly,
    } = props;

    return (
      <TextField
        id={textareaId}
        inputRef={ref}
        label={label}
        error={Boolean(error)}
        helperText={error ?? hint}
        multiline
        rows={rows}
        fullWidth
        className={className}
        name={name}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={onBlur}
        slotProps={{
          htmlInput: {
            maxLength,
            minLength,
            readOnly,
            'aria-invalid': Boolean(error),
          },
        }}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
