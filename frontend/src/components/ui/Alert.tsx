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
  action?: ReactNode;
  onClose?: () => void;
}

/** Mensaje contextual (informacion, exito, advertencia o error) con icono. */
export const Alert = ({
  variant = 'info',
  title,
  children,
  className,
  action,
  onClose,
}: AlertProps) => {
  return (
    <MuiAlert
      severity={variant === 'danger' ? 'error' : variant}
      variant="standard"
      className={cn(className)}
      role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'}
      action={action}
      onClose={onClose}
      sx={{ '& .MuiAlert-message': { width: '100%' } }}
    >
      {title && <AlertTitle sx={{ mb: children ? .35 : 0, fontWeight: 800, lineHeight: 1.35 }}>{title}</AlertTitle>}
      {children}
    </MuiAlert>
  );
};
