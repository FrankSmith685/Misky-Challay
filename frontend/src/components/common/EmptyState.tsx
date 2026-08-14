import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import { cn } from '@lib/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 'panel' = tarjeta destacada (default); 'inset' = versión compacta para dentro de tarjetas/columnas. */
  variant?: 'panel' | 'inset';
  className?: string;
}

/** Estado vacio reutilizable: icono + mensaje + accion opcional. */
export const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = 'panel',
  className,
}: EmptyStateProps) => {
  if (variant === 'inset') {
    return (
      <div
        className={cn(
          'flex flex-col items-center rounded-card border border-dashed border-line bg-surface-muted/40 px-4 py-10 text-center',
          className,
        )}
      >
        <Icon className="size-9 text-brand-300" />
        <h3 className="mt-3 text-sm font-bold text-ink">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }

  return (
    <Paper
      variant="outlined"
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-card border border-dashed border-brand-200 bg-gradient-to-b from-brand-50/70 to-surface px-6 py-14 text-center',
        className,
      )}
    >
      <Box className="absolute -top-20 size-44 rounded-full bg-brand-100/50 blur-3xl" />
      <Box className="relative grid size-14 place-items-center rounded-card bg-surface text-brand-600 shadow-e3 ring-1 ring-brand-100"><Icon className="size-6" /></Box>
      <Typography component="h3" className="relative mt-4 text-base font-bold text-ink" sx={{ fontWeight: 750 }}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" className="relative mt-1 max-w-sm">{description}</Typography>}
      {action && <Box className="relative mt-5">{action}</Box>}
    </Paper>
  );
};
