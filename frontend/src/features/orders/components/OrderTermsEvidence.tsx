import type { CheckoutTerms } from '@services/checkoutTerms';

export type TermsAcceptance = CheckoutTerms & { acceptedAt: string; channel: 'WEB' | 'MOBILE' };

export function OrderTermsEvidence({ acceptance }: { acceptance?: TermsAcceptance | null }) {
  if (!acceptance) return null;
  return <details className="rounded-card border border-line bg-white p-4 text-sm">
    <summary className="cursor-pointer font-semibold">Condiciones aceptadas · versión {acceptance.version}</summary>
    <p className="mt-3 text-xs text-ink-muted">Aceptadas el {new Date(acceptance.acceptedAt).toLocaleString('es-PE')} · {acceptance.channel === 'MOBILE' ? 'App móvil' : 'Web'}</p>
    <p className="mt-3 font-medium">{acceptance.acceptanceLabel}</p>
    <h3 className="mt-4 font-semibold">{acceptance.title}</h3>
    <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words leading-6">{acceptance.content}</p>
  </details>;
}
