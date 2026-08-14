import { useId, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ImageUp, UploadCloud } from 'lucide-react';
import { cn } from '@lib/cn';

interface DropzoneProps {
  /** Tipos MIME admitidos. Se valida aqui, no solo en el `accept` del input. */
  accept: string[];
  /** Peso maximo del archivo ORIGINAL, en megabytes. */
  maxSizeMb: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  onSelect: (file: File) => void;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const extensionsOf = (accept: string[]) =>
  accept.map((type) => type.replace('image/', '').toUpperCase()).join(', ');

/**
 * Zona de carga de archivos: clic, arrastrar y soltar, o teclado.
 *
 * Valida tipo y peso ANTES de tocar el servidor. El atributo `accept` del input
 * solo filtra el dialogo del sistema: no impide arrastrar un PDF de 40 MB, y sin
 * esta comprobacion el error aparecia recien tras subir el archivo entero.
 */
export const Dropzone = ({
  accept,
  maxSizeMb,
  label = 'Arrastra una imagen o haz clic para elegirla',
  hint,
  disabled = false,
  className,
  onSelect,
}: DropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const describedBy = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return `Formato no admitido. Usa ${extensionsOf(accept)}.`;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      return `La imagen pesa ${formatSize(file.size)} y el maximo es ${maxSizeMb} MB.`;
    }
    if (file.size === 0) return 'El archivo esta vacio.';
    return '';
  };

  const accept_ = (file: File | null | undefined) => {
    if (!file) return;
    const problem = validate(file);
    setError(problem);
    if (!problem) onSelect(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    accept_(event.dataTransfer.files?.[0]);
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'grid cursor-pointer place-items-center gap-2 rounded-field border-2 border-dashed px-4 py-7 text-center transition',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          disabled && 'cursor-not-allowed opacity-60',
          isDragging
            ? 'border-brand-500 bg-brand-50'
            : error
              ? 'border-red-300 bg-red-50/50'
              : 'border-line bg-surface-muted/40 hover:border-brand-300 hover:bg-brand-50/40',
        )}
      >
        <span
          className={cn(
            'grid size-11 place-items-center rounded-card transition',
            isDragging ? 'bg-brand-700 text-white' : 'bg-white text-brand-700 ring-1 ring-brand-100',
          )}
        >
          {isDragging ? <ImageUp className="size-5" /> : <UploadCloud className="size-5" />}
        </span>
        <span className="text-sm font-extrabold text-ink">
          {isDragging ? 'Suelta la imagen aqui' : label}
        </span>
        <span id={describedBy} className="text-xs leading-5 text-ink-muted">
          {hint ?? `${extensionsOf(accept)} · hasta ${maxSizeMb} MB`}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            accept_(event.target.files?.[0]);
            // Permite volver a elegir el MISMO archivo tras corregir un error.
            event.target.value = '';
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-5 text-red-600"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
};
