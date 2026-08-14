import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Alert, Button, Input } from '@components/ui';
import { useAppDispatch } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { resetPassword } from '../authSlice';
import { AuthFormFooter } from '../components/AuthFormFooter';
import { AuthShell } from '../components/AuthShell';
import { PasswordMatchStatus } from '../components/PasswordMatchStatus';
import { PasswordStrength } from '../components/PasswordStrength';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Usa al menos 8 caracteres')
      .regex(/[A-Z]/, 'Incluye al menos una mayúscula')
      .regex(/\d/, 'Incluye al menos un número'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password', '');
  const confirmation = watch('confirmPassword', '');

  const onSubmit = async (values: ResetForm) => {
    setLoading(true);
    setSubmitError('');
    const result = await dispatch(resetPassword({ token, password: values.password }));
    setLoading(false);

    if (resetPassword.fulfilled.match(result)) {
      toast.success('Contraseña actualizada. Ingresa con tu nueva clave.');
      navigate(ROUTES.login, { replace: true });
      return;
    }

    setSubmitError(result.payload ?? 'No se pudo restablecer la contraseña');
  };

  if (!token) {
    return (
      <AuthShell
        eyebrow="Enlace inválido"
        title="Necesitas un enlace nuevo"
        description="Este enlace está incompleto, venció o ya fue utilizado."
      >
        <Alert variant="warning" title="No podemos continuar">
          Solicita otro correo de recuperación para proteger el acceso a tu cuenta.
        </Alert>
        <Button
          component={Link}
          to={ROUTES.forgotPassword}
          size="lg"
          className="w-full"
          leftIcon={<KeyRound className="size-4" />}
        >
          Solicitar un enlace nuevo
        </Button>
        <AuthFormFooter
          prompt="¿Ya puedes ingresar?"
          linkLabel="Volver al inicio de sesión"
          to={ROUTES.login}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Último paso"
      title="Crea una contraseña nueva"
      description="Al guardarla cerraremos las sesiones anteriores para mantener tu cuenta protegida."
    >
      {submitError && (
        <Alert
          variant="danger"
          title="No pudimos actualizar la contraseña"
          onClose={() => setSubmitError('')}
        >
          {submitError}
        </Alert>
      )}

      <Alert variant="success">
        <span className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          El enlace fue reconocido. Ahora elige una clave que no uses en otros servicios.
        </span>
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-6">
          <div>
            <Input
              label="Nueva contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              error={errors.password?.message}
              hint="Mínimo 8 caracteres"
              reserveHelperSpace
              startAdornment={<LockKeyhole className="size-[18px]" />}
              endAdornment={
                <IconButton
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  edge="end"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </IconButton>
              }
              {...register('password')}
            />
            <PasswordStrength password={password} />
          </div>

          <div>
            <Input
              label="Confirma tu contraseña"
              type={showConfirmation ? 'text' : 'password'}
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              hint="Escríbela nuevamente"
              reserveHelperSpace
              startAdornment={<LockKeyhole className="size-[18px]" />}
              endAdornment={
                <IconButton
                  aria-label={
                    showConfirmation
                      ? 'Ocultar confirmación de contraseña'
                      : 'Mostrar confirmación de contraseña'
                  }
                  edge="end"
                  onClick={() => setShowConfirmation((visible) => !visible)}
                >
                  {showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}
                </IconButton>
              }
              {...register('confirmPassword')}
            />
            <PasswordMatchStatus password={password} confirmation={confirmation} />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading}
            isLoading={loading}
            leftIcon={<KeyRound className="size-4" />}
          >
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </Button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <Link
          to={ROUTES.login}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-ink-muted hover:text-brand-700"
        >
          <ArrowLeft className="size-3.5" />
          Volver a iniciar sesión
        </Link>
      </div>
    </AuthShell>
  );
};

export default ResetPasswordPage;
