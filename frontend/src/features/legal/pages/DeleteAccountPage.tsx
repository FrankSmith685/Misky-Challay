import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle2, FileText, LogIn, ShieldAlert, Trash2, X } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { getApiErrorMessage } from '@services/api/client';
import { useBusinessInfo } from '@services/businessInfo';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { logout } from '@features/auth/authSlice';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import {
  accountApi,
  type DeleteAccountSummary,
} from '@features/account/services/account.service';

/**
 * ELIMINAR MI CUENTA (pagina publica)
 * ---------------------------------------------------------------------------
 * Google Play y App Store exigen una URL alcanzable SIN instalar la aplicacion
 * donde el titular pueda leer que se borra, que se conserva y como pedir la baja.
 * Por eso vive en el layout publico y no dentro de "Mi cuenta": tiene que abrirse
 * desde la ficha de la tienda, sin sesion y sin app.
 *
 * La baja en si exige sesion y contrasena (el backend la reautentica), asi que la
 * pagina tiene dos caras: informativa siempre, accionable cuando hay sesion.
 */

/** Frase que hay que teclear. Un clic de mas no basta para algo irreversible. */
const CONFIRM_WORD = 'ELIMINAR';

const REMOVED_ITEMS = [
  'Tu nombre, correo electronico y telefono.',
  'Tus direcciones de entrega y sus referencias.',
  'Tus bowls guardados, favoritos, preferencias alimentarias y alergenos.',
  'Tus avisos de disponibilidad y el registro de tus dispositivos moviles.',
  'Tu suscripcion al boletin y el destinatario de los correos que te enviamos.',
];

const KEPT_ITEMS = [
  'Tus pedidos y sus comprobantes de pago (boletas y facturas).',
  'Los movimientos de tu billetera y los planes que compraste.',
  'Los reclamos que hayas presentado en el Libro de Reclamaciones.',
];

const DeleteAccountPage = () => {
  const business = useBusinessInfo();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<DeleteAccountSummary | null>(null);

  const canSubmit =
    password.length > 0 && understood && confirmWord.trim().toUpperCase() === CONFIRM_WORD;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      setReceipt(
        await accountApi.deleteAccount({ password, reason: reason.trim() || undefined }),
      );
      /* La sesion ya esta revocada en el servidor: limpiar Redux y el
       * almacenamiento local evita que la aplicacion siga aparentando estar
       * dentro mientras cada peticion devuelve 401. */
      dispatch(logout());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <Container className="legal-process-page" maxWidth="sm" sx={{ py: { xs: 6, md: 9 } }}>
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', borderRadius: 'var(--radius-card)' }}
        >
          <CheckCircle2 size={44} className="text-brand-600" />
          <Typography variant="h5" sx={{ mt: 2, fontWeight: 800 }}>
            Tu cuenta fue eliminada
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            Tus datos personales se borraron de inmediato. Ya no podras iniciar sesion con ese
            correo, pero puedes volver a registrarte con el cuando quieras.
          </Typography>

          {receipt.keptOrders > 0 && (
            <Alert severity="info" icon={<FileText size={18} />} sx={{ mt: 3, textAlign: 'left' }}>
              Conservamos {receipt.keptOrders}{' '}
              {receipt.keptOrders === 1 ? 'pedido' : 'pedidos'} con sus comprobantes, sin datos que
              te identifiquen, porque la ley tributaria obliga a guardarlos.
            </Alert>
          )}

          {receipt.forfeitedWalletBalance > 0 && (
            <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
              El saldo de {formatCurrency(receipt.forfeitedWalletBalance)} que tenias en tu
              billetera dejo de estar disponible.
            </Alert>
          )}

          <Button component={RouterLink} to={ROUTES.home} variant="contained" sx={{ mt: 3 }}>
            Volver al inicio
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container className="legal-process-page" maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
        <Trash2 size={26} className="text-brand-600" />
        <Typography component="h1" variant="h4" sx={{ fontWeight: 800 }}>
          Eliminar mi cuenta
        </Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {business.legalName}{business.ruc ? ` · RUC ${business.ruc}` : ''}. Aqui puedes pedir la baja de tu cuenta de
        {business.commercialName}, desde la web o desde la aplicacion movil, y ver exactamente que pasa con tu
        informacion.
      </Typography>

      <Stack spacing={2.5} sx={{ mb: 4 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 'var(--radius-card)' }}>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>
            Que eliminamos
          </Typography>
          <List dense sx={{ mt: 0.5 }}>
            {REMOVED_ITEMS.map((item) => (
              <ListItem key={item} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                  <X size={16} color="#b3261e" />
                </ListItemIcon>
                <ListItemText slotProps={{ primary: { color: 'text.secondary' } }} primary={item} />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 'var(--radius-card)' }}>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>
            Que conservamos y por que
          </Typography>
          <List dense sx={{ mt: 0.5 }}>
            {KEPT_ITEMS.map((item) => (
              <ListItem key={item} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                  <FileText size={16} className="text-brand-600" />
                </ListItemIcon>
                <ListItemText slotProps={{ primary: { color: 'text.secondary' } }} primary={item} />
              </ListItem>
            ))}
          </List>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Un comprobante emitido no se puede borrar: el Codigo Tributario obliga a conservarlo y
            la Ley 29733 admite esa excepcion. Lo que si desaparece es el vinculo contigo, porque tu
            perfil queda anonimizado en el mismo momento. Lee la{' '}
            <Link component={RouterLink} to={ROUTES.privacy}>
              Politica de Privacidad
            </Link>{' '}
            para el detalle de plazos y derechos.
          </Typography>
        </Paper>
      </Stack>

      <Alert severity="warning" icon={<ShieldAlert size={20} />} sx={{ mb: 4 }}>
        La baja es inmediata e irreversible. Se cierran todas tus sesiones, dejas de recibir avisos
        de pedidos y <strong>pierdes el saldo de tu billetera y los beneficios de tu plan</strong>.
        Si te queda saldo, usalo antes de continuar.
        Cancela tus suscripciones y programa las cajas ya pagadas antes de cerrar la cuenta.
      </Alert>

      {isAuthenticated ? (
        <Paper
          component="form"
          onSubmit={submit}
          variant="outlined"
          sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Confirmar la eliminacion
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            Por seguridad te pedimos tu contrasena otra vez, aunque ya tengas la sesion abierta.
          </Typography>

          <Stack spacing={2.5}>
            <TextField
              label="Tu contrasena"
              type="password"
              fullWidth
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <TextField
              label="Motivo (opcional)"
              fullWidth
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 300 } }}
              helperText="Nos ayuda a mejorar. No se publica en ningun sitio."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <TextField
              label={`Escribe ${CONFIRM_WORD} para confirmar`}
              fullWidth
              value={confirmWord}
              onChange={(event) => setConfirmWord(event.target.value)}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={understood}
                  onChange={(event) => setUnderstood(event.target.checked)}
                />
              }
              label="Entiendo que esta accion no se puede deshacer"
            />
          </Stack>

          <Divider sx={{ my: 3 }} />
          <Button
            type="submit"
            variant="contained"
            color="error"
            size="large"
            fullWidth
            disabled={!canSubmit || submitting}
            startIcon={<Trash2 size={18} />}
            sx={{ minHeight: 48 }}
          >
            {submitting ? 'Eliminando…' : 'Eliminar mi cuenta definitivamente'}
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Identificate para continuar
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            Solo el titular puede dar de baja su cuenta, asi que primero necesitamos que inicies
            sesion. Al hacerlo volveras a esta pagina.
          </Typography>
          <Button
            component={RouterLink}
            /* El destino viaja tambien por `state`: es lo que lee readReturnTo y
             * lo que sobrevive si el usuario recarga la pantalla de acceso. */
            to={`${ROUTES.login}?returnTo=${encodeURIComponent(ROUTES.deleteAccount)}`}
            state={{ from: `${location.pathname}${location.search}` }}
            variant="contained"
            size="large"
            startIcon={<LogIn size={18} />}
            sx={{ minHeight: 48 }}
          >
            Ingresar y eliminar mi cuenta
          </Button>
        </Paper>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Si perdiste el acceso a tu correo o no puedes iniciar sesion, escribenos a{' '}
          <Link href={`mailto:${business.supportEmail}?subject=Eliminacion%20de%20cuenta`}>
            {business.supportEmail}
          </Link>{' '}
          desde el correo de tu cuenta, o llamanos al {business.phone}. Verificamos tu identidad y
          atendemos la solicitud en un maximo de {business.complaintResponseDays} dias habiles.
        </Typography>
      </Box>
    </Container>
  );
};

export default DeleteAccountPage;
