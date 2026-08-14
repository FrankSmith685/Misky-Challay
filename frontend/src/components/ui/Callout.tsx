import type { ReactNode } from 'react';
import MuiAlert from '@mui/material/Alert';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface CalloutProps {
  tone?: Tone;
  /** Icono personalizado, o `null` para ocultarlo. Por defecto, uno segun el tono. */
  icon?: LucideIcon | null;
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}

const TONES: Record<
  Tone,
  {
    severity: 'info' | 'success' | 'warning' | 'error';
    Default: LucideIcon;
    role: 'status' | 'alert';
  }
> = {
  info: { severity: 'info', Default: Info, role: 'status' },
  success: { severity: 'success', Default: CheckCircle2, role: 'status' },
  warning: { severity: 'warning', Default: AlertTriangle, role: 'alert' },
  danger: { severity: 'error', Default: XCircle, role: 'alert' },
};

/** Banner compacto personalizado sobre Alert de MUI y el tema global. */
export const Callout = ({ tone = 'info', icon, size = 'md', children, className }: CalloutProps) => {
  const toneConfig = TONES[tone];
  const Icon = icon === null ? null : (icon ?? toneConfig.Default);

  return (
    <MuiAlert
      severity={toneConfig.severity}
      variant="standard"
      role={toneConfig.role}
      className={className}
      icon={Icon ? <Icon size={size === 'sm' ? 16 : 18} /> : false}
      sx={{
        minHeight: size === 'sm' ? 44 : 52,
        px: size === 'sm' ? 1.25 : 1.5,
        py: size === 'sm' ? .75 : 1,
        fontSize: size === 'sm' ? 12 : 14,
        '& .MuiAlert-icon': {
          width: size === 'sm' ? 28 : 32,
          height: size === 'sm' ? 28 : 32,
          mr: size === 'sm' ? 1 : 1.25,
        },
      }}
    >
      {children}
    </MuiAlert>
  );
};
