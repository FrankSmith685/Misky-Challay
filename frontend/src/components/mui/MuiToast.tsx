/* eslint-disable react-refresh/only-export-components -- La API toast y su host comparten deliberadamente el mismo módulo. */
import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Portal from '@mui/material/Portal';
import Snackbar from '@mui/material/Snackbar';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

type ToastSeverity = 'success' | 'error' | 'warning' | 'info';
type ToastItem = { id: number; message: string; severity: ToastSeverity };
type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let notificationId = 0;

const publish = (message: unknown, severity: ToastSeverity = 'info') => {
  const item = { id: ++notificationId, message: String(message), severity };
  listeners.forEach((listener) => listener(item));
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
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const listener: Listener = (item) => setQueue((items) => [...items, item]);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue((items) => items.slice(1));
    setOpen(true);
  }, [current, queue]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => setCurrent(null), 220);
  };

  return (
    <Portal>
      <Snackbar
        key={current?.id}
        open={open}
        autoHideDuration={toastOptions?.duration ?? 3600}
        onClose={close}
        anchorOrigin={isMobile ? { vertical: 'bottom', horizontal: 'center' } : { vertical: 'top', horizontal: 'right' }}
        sx={(muiTheme) => ({
          position: 'fixed !important',
          zIndex: muiTheme.zIndex.snackbar,
          top: isMobile ? 'auto !important' : '84px !important',
          right: isMobile ? '12px !important' : '24px !important',
          bottom: isMobile ? '12px !important' : 'auto !important',
          left: isMobile ? '12px !important' : 'auto !important',
          width: isMobile ? 'auto' : 336,
          maxWidth: isMobile ? 'none' : 'calc(100vw - 48px)',
          transform: 'none !important',
        })}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="standard"
            onClose={close}
            elevation={10}
            sx={{
              width: '100%',
              alignItems: 'center',
              border: '1px solid',
              borderLeftWidth: 4,
              borderColor: `${current.severity}.main`,
              borderRadius: 3,
              color: 'text.primary',
              bgcolor: 'background.paper',
              boxShadow: '0 12px 32px rgba(20,32,26,.14)',
              '& .MuiAlert-icon': { mr: 1.25, fontSize: 22, color: `${current.severity}.main` },
              '& .MuiAlert-message': { minWidth: 0, py: .25 },
              '& .MuiAlert-action': { ml: 1, pl: 0, color: 'text.secondary' },
            }}
          >
            <AlertTitle sx={{ mb: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
              {current.severity === 'success' ? 'Listo' : current.severity === 'error' ? 'No se pudo completar' : current.severity === 'warning' ? 'Atención' : 'Información'}
            </AlertTitle>
            <span style={{ fontSize: 12.5, lineHeight: 1.35 }}>{current.message}</span>
          </Alert>
        ) : undefined}
      </Snackbar>
    </Portal>
  );
};

export default toast;
