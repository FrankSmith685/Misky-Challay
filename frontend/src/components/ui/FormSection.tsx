import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

interface FormSectionProps {
  id?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'brand';
}

/** Agrupa campos relacionados y hace escaneables los formularios extensos. */
export const FormSection = ({ id, title, description, icon: Icon, children, className, tone = 'default' }: FormSectionProps) => (
  <section id={id} data-ui-form-section className={cn('rounded-card border p-5 sm:p-6', tone === 'brand' ? 'border-brand-200 bg-brand-50/45' : 'border-line bg-white', className)}>
    <div className="mb-5 flex items-start gap-3">
      {Icon && <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700 ring-1 ring-brand-100"><Icon className="size-4" /></span>}
      <div className="min-w-0">
        <h3 className="text-sm font-extrabold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

/** Columna de campos con el ritmo vertical oficial de formularios. */
export const FormStack = ({
  children,
  className,
  spacing = 2.5,
}: {
  children: ReactNode;
  className?: string;
  spacing?: number;
}) => (
  <Box
    className={cn('min-w-0', className)}
    data-form-stack
    sx={{ display: 'grid', gap: spacing, alignItems: 'start', minWidth: 0 }}
  >
    {children}
  </Box>
);

/** Rejilla responsiva para campos relacionados, sin apretarlos en movil. */
export const FormGrid = ({
  children,
  className,
  minColumnWidth = 240,
}: {
  children: ReactNode;
  className?: string;
  minColumnWidth?: number;
}) => (
  <Box
    className={cn('min-w-0', className)}
    sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minColumnWidth}px), 1fr))`,
      gap: { xs: 2.25, sm: 2.5 },
      alignItems: 'start',
      minWidth: 0,
    }}
  >
    {children}
  </Box>
);

export const FormActions = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    data-form-actions
    className={cn(
      'sticky -bottom-5 z-10 mt-6 flex flex-col-reverse gap-2.5 rounded-card border border-line bg-white/95 px-4 py-4 shadow-e2 backdrop-blur sm:static sm:flex-row sm:justify-end sm:bg-surface-muted/55 sm:px-5 sm:shadow-none',
      className,
    )}
  >
    {children}
  </div>
);
