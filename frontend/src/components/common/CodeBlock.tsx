import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@lib/cn';

/** Bloque de codigo con boton para copiar. Pensado para la documentacion. */
export const CodeBlock = ({ code, className }: { code: string; className?: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // El navegador puede bloquear el portapapeles sin HTTPS; no es critico.
    }
  };

  return (
    <div className={cn('group relative overflow-hidden rounded-xl border border-line bg-ink', className)}>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-brand-100">
        <code>{code}</code>
      </pre>
    </div>
  );
};
