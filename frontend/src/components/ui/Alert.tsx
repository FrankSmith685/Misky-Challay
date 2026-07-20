import type { ReactNode } from 'react';
import MuiAlert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { cn } from '@lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

/** Mensaje contextual (informacion, exito, advertencia o error) con icono. */
export const Alert = ({ variant = 'info', title, children, className }: AlertProps) => {
  return (
    <MuiAlert
      severity={variant === 'danger' ? 'error' : variant}
      variant="outlined"
      className={cn(className)}
      role="status"
      sx={{ bgcolor: 'background.paper', '& .MuiAlert-message': { width: '100%' } }}
    >
      {title && <AlertTitle sx={{ mb: children ? .25 : 0, fontWeight: 750 }}>{title}</AlertTitle>}
      {children}
    </MuiAlert>
  );
};
