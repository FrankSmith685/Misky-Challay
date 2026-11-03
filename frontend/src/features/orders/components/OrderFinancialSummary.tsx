import { formatCurrency } from '@lib/format';
export interface CustomerOrderSummary {
  cancellation: { allowed: boolean; reason: string | null };
  financial: {
    paid: number;
    refunded: number;
    refundPending: number;
    payments: Array<{
      id: number;
      amount: number | string;
      status: string;
      provider: string;
      stage: string;
    }>;
    refunds: Array<{ id: number; amount: number | string; status: string }>;
  };
}
export function OrderFinancialSummary({ summary }: { summary?: CustomerOrderSummary }) {
  if (!summary) return null;
  const { financial } = summary;
  return (
    <section
      aria-label="Pagos y devoluciones"
      className="rounded-card border border-line bg-white p-4"
    >
      <h3 className="font-bold">Pagos y devoluciones</h3>
      <p className="mt-2 text-sm">
        Pagado: {formatCurrency(financial.paid)} · Devuelto: {formatCurrency(financial.refunded)}
      </p>
      {financial.refundPending > 0 && (
        <p role="status" className="mt-2 text-sm font-semibold text-amber-800">
          Devolución pendiente: {formatCurrency(financial.refundPending)}. El equipo coordinará
          contigo la devolución.
        </p>
      )}
      {financial.refunds.map((refund) => (
        <p key={refund.id} className="mt-1 text-xs">
          Devolución de {formatCurrency(Number(refund.amount))}:{' '}
          {refund.status === 'SUCCEEDED'
            ? 'Procesada'
            : refund.status === 'FAILED'
              ? 'Requiere atención'
              : 'En proceso'}
        </p>
      ))}
    </section>
  );
}
