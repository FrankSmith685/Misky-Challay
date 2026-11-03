/* eslint-disable react-refresh/only-export-components -- La API toast y su host comparten deliberadamente el mismo módulo. */
import { useCallback, useEffect, useState } from 'react';
import { keyframes } from '@emotion/react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Portal from '@mui/material/Portal';
import Snackbar from '@mui/material/Snackbar';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

type ToastSeverity = 'success' | 'error' | 'warning' | 'info';
type ToastItem = { id: number; message: string; severity: ToastSeverity };
type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let notificationId = 0;

export const TOAST_DURATION: Record<ToastSeverity, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 6000,
};
const MAX_VISIBLE_AND_QUEUED = 5;
const countdown = keyframes`
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
`;

const publish = (message: unknown, severity: ToastSeverity = 'info') => {
  const item = { id: ++notificationId, message: String(message ?? '').trim(), severity };
  if (item.message) listeners.forEach((listener) => listener(item));
  return String(item.id);
};

type ToastApi = ((message: unknown) => string) & {
  success: (message: unknown) => string;
  error: (message: unknown) => string;
  warning: (message: unknown) => string;
};

/** API pequeña y estable para emitir avisos desde cualquier módulo. */
const toast = ((message: unknown) => publish(message)) as ToastApi;
toast.success = (message) => publish(message, 'success');
toast.error = (message) => publish(message, 'error');
toast.warning = (message) => publish(message, 'warning');

interface ToasterProps {
  position?: string;
  toastOptions?: { duration?: number };
}

/**
 * Centro de notificaciones MUI de toda la aplicación.
 * En escritorio aparece arriba a la derecha; en móvil se muestra abajo para no
 * tapar la navegación y ocupa el ancho disponible.
 */
export const Toaster = ({ toastOptions }: ToasterProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [closingId, setClosingId] = useState<number | null>(null);
  const current = queue[0];
  const currentId = current?.id;
  const open = Boolean(current && current.id !== closingId);
  const override = toastOptions?.duration;
  const duration =
    typeof override === 'number' && Number.isFinite(override) && override > 0
      ? Math.min(override, 10000)
      : TOAST_DURATION[current?.severity ?? 'info'];

  useEffect(() => {
    const listener: Listener = (item) =>
      setQueue((items) => {
        // Un aviso repetido no reinicia el reloj ni ocupa varios turnos en la cola.
        if (
          items.some(
            (queued) => queued.message === item.message && queued.severity === item.severity,
          )
        )
          return items;
        if (items.length >= MAX_VISIBLE_AND_QUEUED)
          return [items[0], ...items.slice(-(MAX_VISIBLE_AND_QUEUED - 2)), item];
        return [...items, item];
      });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const close = useCallback((id: number) => setClosingId(id), []);

  useEffect(() => {
    if (currentId === undefined || !open) return;
    const expiresAt = Date.now() + duration;
    // MUI pausa su autoHideDuration con hover, foco y blur. Estos avisos usan un
    // plazo propio para desaparecer también al seguir trabajando en otra ventana.
    const timer = window.setTimeout(() => close(currentId), duration);
    const expireIfDue = () => {
      if (Date.now() >= expiresAt) close(currentId);
    };
    window.addEventListener('focus', expireIfDue);
    document.addEventListener('visibilitychange', expireIfDue);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', expireIfDue);
      document.removeEventListener('visibilitychange', expireIfDue);
    };
  }, [currentId, open, duration, close]);

  return (
    <Portal>
      <Snackbar
        key={current?.id}
        open={open}
        autoHideDuration={null}
        onClose={(_event, reason) => {
          if (current && reason !== 'clickaway') close(current.id);
        }}
        slotProps={{
          transition: {
            onExited: () => {
              if (currentId === undefined) return;
              // Solo se retira el aviso que terminó su transición, nunca el siguiente.
              setQueue((items) => items.filter((item) => item.id !== currentId));
              setClosingId((id) => (id === currentId ? null : id));
            },
          },
        }}
        anchorOrigin={
          isMobile
            ? { vertical: 'bottom', horizontal: 'center' }
            : { vertical: 'top', horizontal: 'right' }
        }
        sx={(muiTheme) => ({
          position: 'fixed !important',
          zIndex: muiTheme.zIndex.snackbar,
          top: isMobile ? 'auto !important' : '84px !important',
          right: isMobile ? '12px !important' : '24px !important',
          bottom: isMobile ? '12px !important' : 'auto !important',
          left: isMobile ? '12px !important' : 'auto !important',
          width: isMobile ? 'auto' : 380,
          maxWidth: isMobile ? 'none' : 'calc(100vw - 48px)',
          transform: 'none !important',
        })}
      >
        {current ? (
          <Alert
            severity={current.severity}
            role={
              current.severity === 'error' || current.severity === 'warning' ? 'alert' : 'status'
            }
            variant="standard"
            onClose={() => close(current.id)}
            closeText="Cerrar aviso"
            elevation={0}
            sx={{
              width: '100%',
              minHeight: 76,
              position: 'relative',
              overflow: 'hidden',
              alignItems: 'flex-start',
              border: '1px solid',
              borderColor: `${current.severity}.main`,
              borderRadius: 'var(--radius-card)',
              color: 'text.primary',
              bgcolor: 'background.paper',
              boxShadow: 'var(--shadow-e4)',
              px: 1.5,
              py: 1.35,
              '& .MuiAlert-icon': {
                mt: 0.1,
                mr: 1.4,
                fontSize: 22,
                color: `${current.severity}.main`,
                bgcolor: 'background.paper',
                boxShadow: 'var(--shadow-e1)',
              },
              '& .MuiAlert-message': { minWidth: 0, flex: 1, py: 0.1 },
              '& .MuiAlert-action': { mt: -0.25, ml: 1, pl: 0, color: 'text.secondary' },
            }}
          >
            <AlertTitle sx={{ mb: 0.35, fontSize: 14, fontWeight: 850, lineHeight: 1.35 }}>
              {current.severity === 'success'
                ? 'Listo'
                : current.severity === 'error'
                  ? 'No se pudo completar'
                  : current.severity === 'warning'
                    ? 'Atención'
                    : 'Información'}
            </AlertTitle>
            <span style={{ display: 'block', fontSize: 13, lineHeight: 1.45 }}>
              {current.message}
            </span>
            <LinearProgress
              variant="determinate"
              value={100}
              aria-hidden="true"
              color={current.severity}
              sx={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                left: 0,
                height: 3,
                bgcolor: 'transparent',
                '& .MuiLinearProgress-bar': {
                  transformOrigin: 'left center',
                  animation: `${countdown} ${duration}ms linear forwards`,
                  transition: 'none',
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '& .MuiLinearProgress-bar': { animation: 'none' },
                },
              }}
            />
          </Alert>
        ) : undefined}
      </Snackbar>
    </Portal>
  );
};

export default toast;
