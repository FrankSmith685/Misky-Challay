import type { ElementType, ReactNode } from 'react';
import { cn } from '@lib/cn';

type SectionTone = 'white' | 'soft' | 'brand' | 'dark';

const TONES: Record<SectionTone, string> = {
  white: 'bg-white text-ink',
  soft: 'bg-surface-muted text-ink',
  brand: 'bg-brand-50 text-ink',
  dark: 'bg-brand-900 text-white',
};

interface MarketingSectionProps {
  children: ReactNode;
  id?: string;
  tone?: SectionTone;
  className?: string;
  contentClassName?: string;
  component?: ElementType;
}

/** Contenedor reutilizable para secciones públicas con ancho y espaciado consistentes. */
export const MarketingSection = ({
  children,
  id,
  tone = 'white',
  className,
  contentClassName,
  component: Component = 'section',
}: MarketingSectionProps) => (
  <Component id={id} className={cn('relative overflow-hidden', TONES[tone], className)}>
    <div className={cn('container-shell relative py-14 sm:py-20 lg:py-24', contentClassName)}>
      {children}
    </div>
  </Component>
);

interface MarketingHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  inverse?: boolean;
  className?: string;
}

/** Encabezado editorial compartido por home, planes y páginas comerciales. */
export const MarketingHeading = ({
  eyebrow,
  title,
  description,
  align = 'left',
  inverse = false,
  className,
}: MarketingHeadingProps) => (
  <header className={cn(align === 'center' && 'mx-auto max-w-3xl text-center', className)}>
    {eyebrow && (
      <p
        className={cn(
          'text-xs font-extrabold uppercase tracking-[.2em]',
          inverse ? 'text-brand-300' : 'text-brand-700',
        )}
      >
        {eyebrow}
      </p>
    )}
    <h2
      className={cn(
        'mt-3 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl',
        inverse ? 'text-white' : 'text-ink',
      )}
    >
      {title}
    </h2>
    {description && (
      <p
        className={cn(
          'mt-4 max-w-2xl text-base leading-7 sm:text-lg',
          align === 'center' && 'mx-auto',
          inverse ? 'text-brand-100' : 'text-ink-muted',
        )}
      >
        {description}
      </p>
    )}
  </header>
);
