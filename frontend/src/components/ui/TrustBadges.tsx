import { Lock, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';
import { useReceiptSettings } from '@services/businessInfo';

export interface TrustItem {
  icon: LucideIcon;
  label: string;
}

/** Señales de confianza válidas para cualquier método de pago (tarjeta, efectivo o saldo). */
const DEFAULT_ITEMS: TrustItem[] = [
  { icon: ShieldCheck, label: 'Compra protegida' },
  { icon: Lock, label: 'Tus datos, seguros' },
];

interface TrustBadgesProps {
  /** 'full' = lista con iconos en círculo (junto al pago); 'compact' = fila breve (carrito). */
  variant?: 'full' | 'compact';
  items?: TrustItem[];
  className?: string;
}

/** Señales de confianza consistentes para los momentos de decisión (carrito y pago). */
export const TrustBadges = ({ variant = 'full', items, className }: TrustBadgesProps) => {
  const receipts = useReceiptSettings();
  const visibleItems = items ?? [
    ...DEFAULT_ITEMS,
    ...(receipts.mode !== 'INTERNAL_ONLY' ? [{ icon: ReceiptText, label: 'Comprobante SUNAT' }] : []),
  ];
  if (variant === 'compact') {
    return (
      <ul className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-muted', className)}>
        {visibleItems.map(({ icon: Icon, label }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <Icon className="size-3.5 text-brand-600" /> {label}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={cn('grid gap-2', className)}>
      {visibleItems.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-2 text-xs font-medium text-ink-muted">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Icon className="size-3.5" />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
};
