import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import { cn } from '@lib/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Estado vacio reutilizable: icono + mensaje + accion opcional. */
export const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => (
  <Paper
    variant="outlined"
    className={cn(
      'relative flex flex-col items-center overflow-hidden rounded-[1.35rem] border border-dashed border-brand-200 bg-gradient-to-b from-brand-50/70 to-surface px-6 py-14 text-center',
      className,
    )}
  >
    <Box className="absolute -top-20 size-44 rounded-full bg-brand-100/50 blur-3xl" />
    <Box className="relative grid size-14 place-items-center rounded-2xl bg-surface text-brand-600 shadow-[0_8px_24px_rgba(20,60,40,.10)] ring-1 ring-brand-100"><Icon className="size-6" /></Box>
    <Typography className="relative mt-4 text-base font-bold text-ink" sx={{ fontWeight: 750 }}>{title}</Typography>
    {description && <Typography variant="body2" color="text.secondary" className="relative mt-1 max-w-sm">{description}</Typography>}
    {action && <Box className="relative mt-5">{action}</Box>}
  </Paper>
);
