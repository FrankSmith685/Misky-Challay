import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Campo de texto multilinea, a juego con Input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, rows = 4, ...props }, ref) => {
    const textareaId = id ?? props.name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="mb-1 block text-sm font-medium text-ink">
            {label}
          </label>
        )}

        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          aria-invalid={!!error}
          className={cn(
            'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-sm shadow-ink/5 outline-none transition-all placeholder:text-ink-muted/55 hover:border-brand-200',
            'focus:border-brand-500 focus:ring-4 focus:ring-brand-100/70 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-100',
            className,
          )}
          {...props}
        />

        {error ? (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        ) : (
          hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
