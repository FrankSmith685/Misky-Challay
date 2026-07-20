import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { login } from '../authSlice';
import { ROUTES } from '@constants/routes';
import { AuthShell } from '../components/AuthShell';

const loginSchema = z.object({
  email: z.string().email('Ingresa un email valido'),
  password: z.string().min(1, 'Ingresa tu contrasena'),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Pagina de ejemplo completa: react-hook-form + zod + thunk de Redux. */
const LoginPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginForm) => {
    const result = await dispatch(login(values));

    if (login.fulfilled.match(result)) {
      toast.success('Bienvenido de vuelta');

      const from = (location.state as { from?: string } | null)?.from;
      if (from) {
        navigate(from, { replace: true });
        return;
      }

      // Al personal lo llevamos directo al panel: no viene a comprar, viene a trabajar.
      // (Un superadmin o un admin que ademas es cliente puede volver a la tienda cuando quiera.)
      const user = result.payload.user;
      const isStaff = user.isSuperAdmin || user.permissions.length > 0;

      navigate(isStaff ? ROUTES.admin : ROUTES.home, { replace: true });
      return;
    }

    toast.error(result.payload ?? 'No se pudo iniciar sesion');
  };

  return (
    <AuthShell
      eyebrow="Bienvenido de vuelta"
      title="Inicia sesión"
      description="Ingresa con tus datos para continuar a tu cuenta o al panel de administración."
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
            helperText={errors.email?.message ?? 'Usa el correo con el que creaste tu cuenta'}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><Mail size={19} /></InputAdornment>,
              },
            }}
            {...register('email')}
          />

          <TextField
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message ?? 'Ingresa tu contraseña de acceso'}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><LockKeyhole size={19} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      edge="end"
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            {...register('password')}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={status === 'loading'}
            startIcon={status === 'loading' ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {status === 'loading' ? 'Ingresando…' : 'Ingresar a mi cuenta'}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }}><Typography variant="caption" color="text.secondary">¿Primera vez aquí?</Typography></Divider>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        ¿Aún no tienes una cuenta?{' '}
        <MuiLink component={Link} to={ROUTES.register} underline="hover" sx={{ fontWeight: 750 }}>
          Créala gratis
        </MuiLink>
      </Typography>
    </AuthShell>
  );
};

export default LoginPage;
