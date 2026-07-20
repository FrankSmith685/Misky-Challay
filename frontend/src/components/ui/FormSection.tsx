import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'brand';
}

/** Agrupa campos relacionados y hace escaneables los formularios extensos. */
export const FormSection = ({ title, description, icon: Icon, children, className, tone = 'default' }: FormSectionProps) => (
  <section className={cn('rounded-2xl border p-4 sm:p-5', tone === 'brand' ? 'border-brand-200 bg-brand-50/45' : 'border-line bg-white', className)}>
    <div className="mb-4 flex items-start gap-3">
      {Icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><Icon className="size-4" /></span>}
      <div className="min-w-0">
        <h3 className="text-sm font-extrabold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const FormActions = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 border-t border-line bg-surface-muted/55 px-5 py-4 sm:flex-row sm:justify-end', className)}>
    {children}
  </div>
);
