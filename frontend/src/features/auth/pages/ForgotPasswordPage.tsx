import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  InputAdornment,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle2, Mail } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useAppDispatch } from '@app/hooks';
import { requestPasswordReset } from '../authSlice';
import { ROUTES } from '@constants/routes';
import { AuthShell } from '../components/AuthShell';

const schema = z.object({ email: z.string().email('Ingresa un email valido') });
type ForgotForm = z.infer<typeof schema>;

const ForgotPasswordPage = () => {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  // No revelamos si el correo existe: al enviar, siempre mostramos la misma
  // confirmacion (el backend responde igual exista o no la cuenta).
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: ForgotForm) => {
    setLoading(true);
    const result = await dispatch(requestPasswordReset(values));
    setLoading(false);
    if (requestPasswordReset.fulfilled.match(result)) {
      setSent(true);
    } else {
      toast.error(result.payload ?? 'No se pudo procesar la solicitud');
    }
  };

  if (sent) {
    return (
      <AuthShell eyebrow="Revisa tu correo" title="Enlace enviado" description="Si el correo está registrado, te llegará un enlace para crear una contraseña nueva.">
        <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center', py: 1 }}>
          <CheckCircle2 size={44} color="#237c52" />
          <Typography color="text.secondary">
            Abre el enlace desde tu correo. Vence en 60 minutos. Si no lo ves, revisa la carpeta de
            spam.
          </Typography>
          <Button component={Link} to={ROUTES.login} variant="contained" fullWidth sx={{ minHeight: 48 }}>
            Volver a iniciar sesión
          </Button>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Recuperar acceso"
      title="¿Olvidaste tu contraseña?"
      description="Escribe tu correo y te enviaremos un enlace para crear una nueva."
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2.5}>
          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            fullWidth
            autoFocus
            error={Boolean(errors.email)}
            helperText={errors.email?.message ?? 'El correo con el que creaste tu cuenta'}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><Mail size={19} /></InputAdornment>,
              },
            }}
            {...register('email')}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {loading ? 'Enviando…' : 'Enviarme el enlace'}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        ¿Recordaste tu contraseña?{' '}
        <MuiLink component={Link} to={ROUTES.login} underline="hover" sx={{ fontWeight: 750 }}>
          Inicia sesión
        </MuiLink>
      </Typography>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
