import type { HTMLAttributes } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { cn } from '@lib/cn';

/** Pasos de la escala de elevacion de styles/index.css. */
type Elevation = 'none' | 'e1' | 'e2' | 'e3' | 'e4' | 'e5';

// Clases literales: el JIT de Tailwind no ve nombres interpolados.
const ELEVATION: Record<Elevation, string> = {
  none: 'shadow-none',
  e1: 'shadow-e1',
  e2: 'shadow-e2',
  e3: 'shadow-e3',
  e4: 'shadow-e4',
  e5: 'shadow-e5',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Paso de la escala e1..e5. Por defecto `e2`, el reposo de las tarjetas. */
  shadow?: Elevation;
}

/**
 * Superficie base del producto. La sombra sale de la escala de elevacion y no de
 * un valor a ojo, para que dos pantallas hermanas no se vean a distinta
 * profundidad. Al ser una clase (y no `sx`) la puede reemplazar quien la use,
 * que es lo que necesitan las tarjetas con estado activo o hover propio.
 */
export const Card = ({ className, shadow = 'e2', ...props }: CardProps) => (
  <Paper
    component="div"
    data-ui-card
    variant="outlined"
    elevation={0}
    className={cn('rounded-card border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-200', ELEVATION[shadow], className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <Box className={cn('mb-4 grid gap-1', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <Typography component="h3" variant="h6" className={cn('text-lg font-semibold text-ink', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <Typography component="p" variant="body2" className={cn('text-sm text-ink-muted', className)} {...props} />
);
