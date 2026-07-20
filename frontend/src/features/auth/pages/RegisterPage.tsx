import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { register as registerThunk } from '../authSlice';
import { ROUTES } from '@constants/routes';
import { AuthShell } from '../components/AuthShell';

const registerSchema = z
  .object({
    firstName: z.string().min(2, 'Nombre demasiado corto'),
    lastName: z.string().min(2, 'Apellido demasiado corto'),
    email: z.string().email('Ingresa un email valido'),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{6,20}$/, 'Telefono invalido')
      .optional()
      .or(z.literal('')),
    password: z.string().min(8, 'Minimo 8 caracteres'),
    confirmPassword: z.string(),
    acceptedTerms: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.acceptedTerms === true, {
    message: 'Debes aceptar los términos y la política de privacidad',
    path: ['acceptedTerms'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

const RegisterPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const password = watch('password', '');
  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    return Math.min(100, (password.length >= 8 ? 45 : password.length * 5) + (/[A-Z]/.test(password) ? 20 : 0) + (/\d/.test(password) ? 20 : 0) + (/[^\w]/.test(password) ? 15 : 0));
  }, [password]);

  const onSubmit = async (values: RegisterForm) => {
    const result = await dispatch(
      registerThunk({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone ? values.phone : undefined,
        acceptedTerms: values.acceptedTerms,
      }),
    );

    if (registerThunk.fulfilled.match(result)) {
      toast.success('Cuenta creada. Bienvenido a Verde Bowl!');
      navigate(ROUTES.home, { replace: true });
      return;
    }

    toast.error(result.payload ?? 'No se pudo crear la cuenta');
  };

  return (
    <AuthShell
      wide
      eyebrow="Únete a Verde Bowl"
      title="Crea tu cuenta"
      description="Completa tus datos y empieza a disfrutar una experiencia de compra más rápida y personalizada."
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2.25}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Nombre"
              autoComplete="given-name"
              fullWidth
              autoFocus
              error={Boolean(errors.firstName)}
              helperText={errors.firstName?.message}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><UserRound size={18} /></InputAdornment> } }}
              {...register('firstName')}
            />
            <TextField
              label="Apellido"
              autoComplete="family-name"
              fullWidth
              error={Boolean(errors.lastName)}
              helperText={errors.lastName?.message}
              {...register('lastName')}
            />
          </Stack>

          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Mail size={18} /></InputAdornment> } }}
            {...register('email')}
          />

          <TextField
            label="Teléfono"
            type="tel"
            autoComplete="tel"
            placeholder="999 999 999"
            fullWidth
            error={Boolean(errors.phone)}
            helperText={errors.phone?.message ?? 'Opcional · lo usaremos solo para coordinar tus pedidos'}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Phone size={18} /></InputAdornment> } }}
            {...register('phone')}
          />

          <Box>
            <TextField
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              fullWidth
              error={Boolean(errors.password)}
              helperText={errors.password?.message ?? 'Mínimo 8 caracteres; combina números y símbolos'}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockKeyhole size={18} /></InputAdornment>,
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
            {password && (
              <Stack direction="row" spacing={1.5} sx={{ mt: 1, alignItems: 'center' }}>
                <LinearProgress
                  variant="determinate"
                  value={passwordStrength}
                  color={passwordStrength >= 75 ? 'success' : passwordStrength >= 45 ? 'warning' : 'error'}
                  sx={{ flex: 1, height: 5, borderRadius: 99 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {passwordStrength >= 75 ? 'Segura' : passwordStrength >= 45 ? 'Media' : 'Débil'}
                </Typography>
              </Stack>
            )}
          </Box>

          <TextField
            label="Confirma tu contraseña"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Box>
            <FormControlLabel
              sx={{ alignItems: 'flex-start', m: 0 }}
              control={<Checkbox size="small" sx={{ pt: 0 }} {...register('acceptedTerms')} />}
              label={
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  He leído y acepto los{' '}
                  <MuiLink component={Link} to={ROUTES.terms} target="_blank" underline="hover">
                    Términos y Condiciones
                  </MuiLink>{' '}
                  y la{' '}
                  <MuiLink component={Link} to={ROUTES.privacy} target="_blank" underline="hover">
                    Política de Privacidad
                  </MuiLink>
                  , y consiento el tratamiento de mis datos para gestionar mis pedidos y beneficios.
                </Typography>
              }
            />
            {errors.acceptedTerms && (
              <FormHelperText error sx={{ ml: 0 }}>
                {errors.acceptedTerms.message}
              </FormHelperText>
            )}
          </Box>

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={status === 'loading'}
            startIcon={status === 'loading' ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {status === 'loading' ? 'Creando cuenta…' : 'Crear mi cuenta'}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        ¿Ya tienes una cuenta?{' '}
        <MuiLink component={Link} to={ROUTES.login} underline="hover" sx={{ fontWeight: 750 }}>
          Inicia sesión
        </MuiLink>
      </Typography>
    </AuthShell>
  );
};

export default RegisterPage;
