import type { LucideIcon } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import { cn } from '@lib/cn';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  /** Variacion respecto a un periodo anterior (ej. "+12%"). */
  trend?: { value: string; positive?: boolean };
  className?: string;
}

/** Tarjeta de indicador (KPI) para el resumen del panel. */
export const StatCard = ({ label, value, icon: Icon, hint, trend, className }: StatCardProps) => (
  <Paper variant="outlined" className={cn('group rounded-[1.15rem] border-line bg-surface p-5 shadow-[0_8px_28px_rgba(20,32,26,.045)] transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_14px_34px_rgba(20,60,40,.09)]', className)}>
    <Box className="flex items-start justify-between">
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</Typography>
      {Icon && <Box className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100"><Icon className="size-[18px]" /></Box>}
    </Box>

    <Typography className="mt-2 text-3xl font-extrabold tracking-[-.035em] text-ink" sx={{ fontWeight: 800 }}>{value}</Typography>

    {(hint || trend) && (
      <Typography component="p" variant="caption" color="text.secondary" className="mt-1 flex items-center gap-1.5">
        {trend && (
          <span className={cn('font-semibold', trend.positive ? 'text-brand-600' : 'text-red-600')}>
            {trend.value}
          </span>
        )}
        {hint}
      </Typography>
    )}
  </Paper>
);
