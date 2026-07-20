import { useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@lib/cn';

interface FileInputProps {
  label?: string;
  accept?: string;
  onChange?: (file: File | null) => void;
  className?: string;
}

/** Zona para subir un archivo (imagen de producto, etc.) con estilo de marca. */
export const FileInput = ({ label = 'Selecciona un archivo', accept, onChange, className }: FileInputProps) => {
  const [name, setName] = useState<string | null>(null);

  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setName(file?.name ?? null);
    onChange?.(file);
  };

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-surface-muted/40 px-4 py-3 text-sm transition-colors hover:border-brand-300',
        className,
      )}
    >
      <Upload className="size-5 shrink-0 text-brand-600" />
      <span className={cn('truncate', name ? 'text-ink' : 'text-ink-muted')}>{name ?? label}</span>
      <input type="file" accept={accept} onChange={handle} className="hidden" />
    </label>
  );
};
