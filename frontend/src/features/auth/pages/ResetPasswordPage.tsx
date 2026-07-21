import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useAppDispatch } from '@app/hooks';
import { resetPassword } from '../authSlice';
import { ROUTES } from '@constants/routes';
import { AuthShell } from '../components/AuthShell';

const schema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof schema>;

const ResetPasswordPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetForm>({ resolver: zodResolver(schema) });

  const password = watch('password', '');
  const strength = useMemo(() => {
    if (!password) return 0;
    return Math.min(
      100,
      (password.length >= 8 ? 45 : password.length * 5) +
        (/[A-Z]/.test(password) ? 20 : 0) +
        (/\d/.test(password) ? 20 : 0) +
        (/[^\w]/.test(password) ? 15 : 0),
    );
  }, [password]);

  const onSubmit = async (values: ResetForm) => {
    setLoading(true);
    const result = await dispatch(resetPassword({ token, password: values.password }));
    setLoading(false);
    if (resetPassword.fulfilled.match(result)) {
      toast.success('Contraseña restablecida. Inicia sesión con tu nueva clave.');
      navigate(ROUTES.login, { replace: true });
    } else {
      toast.error(result.payload ?? 'No se pudo restablecer la contraseña');
    }
  };

  // Un enlace sin token (o manipulado) no puede continuar.
  if (!token) {
    return (
      <AuthShell eyebrow="Enlace inválido" title="Este enlace no sirve" description="El enlace está incompleto o ya se usó. Solicita uno nuevo.">
        <Button component={Link} to={ROUTES.forgotPassword} variant="contained" fullWidth sx={{ minHeight: 48 }}>
          Solicitar un enlace nuevo
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Casi listo"
      title="Crea una contraseña nueva"
      description="Elige una contraseña segura. Al guardarla, cerraremos tus otras sesiones."
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2.5}>
          <Box>
            <TextField
              label="Nueva contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              fullWidth
              autoFocus
              error={Boolean(errors.password)}
              helperText={errors.password?.message ?? 'Mínimo 8 caracteres; combina números y símbolos'}
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
            {password && (
              <Stack direction="row" spacing={1.5} sx={{ mt: 1, alignItems: 'center' }}>
                <LinearProgress
                  variant="determinate"
                  value={strength}
                  color={strength >= 75 ? 'success' : strength >= 45 ? 'warning' : 'error'}
                  sx={{ flex: 1, height: 5, borderRadius: 99 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {strength >= 75 ? 'Segura' : strength >= 45 ? 'Media' : 'Débil'}
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

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </Stack>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        <MuiLink component={Link} to={ROUTES.login} underline="hover" sx={{ fontWeight: 750 }}>
          Volver a iniciar sesión
        </MuiLink>
      </Typography>
    </AuthShell>
  );
};

export default ResetPasswordPage;
