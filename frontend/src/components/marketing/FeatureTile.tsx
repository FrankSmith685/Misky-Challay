import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

interface FeatureTileProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  eyebrow?: string;
  tone?: 'brand' | 'accent' | 'tertiary';
  className?: string;
}

/** Beneficio compacto reutilizable en barras de confianza y superficies comerciales. */
export const FeatureTile = ({
  icon: Icon,
  title,
  description,
  eyebrow,
  tone = 'brand',
  className,
}: FeatureTileProps) => (
  <article className={cn('flex items-start gap-4', className)}>
    <span className={cn(
      'grid size-11 shrink-0 place-items-center rounded-2xl ring-1',
      tone === 'accent' && 'bg-accent-50 text-accent-700 ring-accent-100',
      tone === 'tertiary' && 'bg-tertiary-50 text-tertiary-700 ring-tertiary-100',
      tone === 'brand' && 'bg-brand-50 text-brand-700 ring-brand-100',
    )}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
    <div className="min-w-0">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{eyebrow}</p>}
      <h3 className="font-extrabold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-ink-muted">{description}</p>
    </div>
  </article>
);
