import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

interface FeatureTileProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  eyebrow?: string;
  className?: string;
}

/** Beneficio compacto reutilizable en barras de confianza y superficies comerciales. */
export const FeatureTile = ({
  icon: Icon,
  title,
  description,
  eyebrow,
  className,
}: FeatureTileProps) => (
  <article className={cn('flex items-start gap-4', className)}>
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
      <Icon className="size-5" aria-hidden="true" />
    </span>
    <div className="min-w-0">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{eyebrow}</p>}
      <h3 className="font-extrabold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-ink-muted">{description}</p>
    </div>
  </article>
);
