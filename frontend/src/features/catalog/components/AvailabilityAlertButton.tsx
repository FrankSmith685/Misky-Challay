import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { Bell, BellOff, Mail, MapPin } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { catalogApi, type AvailabilityAlert } from '../services/catalog.service';

interface AvailabilityAlertButtonProps {
  product: { id: number; name: string; slug: string };
  fullWidth?: boolean;
  compact?: boolean;
}

/** Accion reutilizable para cualquier tarjeta o ficha de producto agotado. */
export const AvailabilityAlertButton = ({
  product,
  fullWidth = false,
  compact = false,
}: AvailabilityAlertButtonProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { branchId, pickupBranch, deliveryType, openLocationModal } = useAppState();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [subscription, setSubscription] = useState<AvailabilityAlert | null>(null);

  const branchLabel = deliveryType === 'PICKUP'
    ? pickupBranch?.name ?? 'local seleccionado'
    : 'el local que atiende tu direccion';

  const begin = async () => {
    if (!branchId) {
      toast('Primero elige tu direccion o local para saber donde debe volver el plato');
      openLocationModal();
      return;
    }
    if (!isAuthenticated) {
      navigate(ROUTES.login, { state: { from: location.pathname } });
      return;
    }

    setOpen(true);
    setLoading(true);
    try {
      const current = await catalogApi.getAvailabilityAlert(product.id, branchId);
      setSubscription(current);
      if (current?.status === 'WAITING') {
        setNotifyEmail(current.notifyEmail);
        setNotifyInApp(current.notifyInApp);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async () => {
    if (!branchId) return;
    if (!notifyEmail && !notifyInApp) {
      toast.error('Elige al menos un canal');
      return;
    }
    setLoading(true);
    try {
      const saved = await catalogApi.subscribeAvailabilityAlert({
        productId: product.id,
        branchId,
        notifyEmail,
        notifyInApp,
      });
      setSubscription(saved);
      setOpen(false);
      toast.success('Listo. Te avisaremos una sola vez cuando vuelva');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      await catalogApi.cancelAvailabilityAlert(product.id, branchId);
      setSubscription(null);
      setOpen(false);
      toast.success('Solicitud de aviso cancelada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const waiting = subscription?.status === 'WAITING';

  return (
    <>
      <Button
        variant="outline"
        fullWidth={fullWidth}
        size={compact ? 'md' : 'lg'}
        leftIcon={<Bell className="size-4" />}
        onClick={() => void begin()}
      >
        Avisame cuando vuelva
      </Button>

      <Modal
        isOpen={open}
        onClose={() => !loading && setOpen(false)}
        title={waiting ? 'Aviso programado' : `Avísame por ${product.name}`}
        description={waiting
          ? 'Tu solicitud está activa. Puedes cambiar los canales o cancelarla.'
          : 'Te avisaremos una sola vez cuando este plato vuelva a estar disponible.'}
        eyebrow="Disponibilidad del menú"
        icon={Bell}
        maxWidth="xs"
        disableBackdropClose
        actions={
          <>
            {waiting && (
              <Button variant="ghost" leftIcon={<BellOff className="size-4" />} isLoading={loading} onClick={() => void cancel()}>
                Cancelar aviso
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cerrar</Button>
            <Button isLoading={loading} onClick={() => void subscribe()}>
              {waiting ? 'Guardar canales' : 'Crear aviso'}
            </Button>
          </>
        }
      >
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1.5, border: '1px solid', borderColor: 'primary.100', bgcolor: 'primary.50', borderRadius: 'var(--radius-card)', p: 1.75 }}>
              <Box sx={{ display: 'grid', width: 36, height: 36, flexShrink: 0, placeItems: 'center', borderRadius: 'var(--radius-field)', bgcolor: 'background.paper', color: 'primary.main' }}><MapPin size={18} /></Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Disponibilidad en</Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{branchLabel}</Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>¿Cómo quieres enterarte?</Typography>
            <Stack sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 'var(--radius-card)', px: 1.5, py: .5, bgcolor: 'background.default' }}>
              <FormControlLabel
                control={<Checkbox checked={notifyInApp} onChange={(event) => setNotifyInApp(event.target.checked)} />}
                label={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Bell size={17} /><span>Notificación dentro de Misky Challay</span></Stack>}
              />
              <FormControlLabel
                control={<Checkbox checked={notifyEmail} onChange={(event) => setNotifyEmail(event.target.checked)} />}
                label={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Mail size={17} /><span>Correo electrónico</span></Stack>}
              />
            </Stack>
            </Box>
            <Typography variant="caption" color="text.secondary">
              La solicitud se cerrará automáticamente después de avisarte. No enviaremos mensajes duplicados.
            </Typography>
          </Stack>
      </Modal>
    </>
  );
};
