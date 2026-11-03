import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Route } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Alert, Button, Input } from '@components/ui';
import { useAppDispatch, useAppSelector, useAppStore } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { login } from '../authSlice';
import { readReturnTo, resolveAfterAuthPath } from '../authRedirect';
import { AuthFormFooter } from '../components/AuthFormFooter';
import { AuthShell } from '../components/AuthShell';
import { resolveStaffAccess } from '../staffAccess';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa tu correo electrónico')
    .email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Acceso único para clientes y equipo, con retorno al flujo que lo solicitó. */
const LoginPage = () => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const from = readReturnTo(location);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginForm) => {
    setSubmitError('');
    const result = await dispatch(login(values));

    if (login.fulfilled.match(result)) {
      toast.success('Bienvenido de vuelta');

      const user = result.payload.user;
      const isStaff = user.isSuperAdmin || user.permissions.length > 0;
      navigate(resolveAfterAuthPath(from, isStaff, resolveStaffAccess(user).to, store.getState().cart.items.length > 0), { replace: true });
      return;
    }

    setSubmitError(result.payload ?? 'No se pudo iniciar sesión');
  };

  return (
    <AuthShell
      eyebrow="Bienvenido de vuelta"
      title="Ingresa a tu cuenta"
      description="Continúa con tus pedidos, direcciones, beneficios y preferencias guardadas."
    >
      {from && (
        <Alert variant="info">
          <span className="flex items-start gap-2">
            <Route className="mt-0.5 size-4 shrink-0" />
            Después de ingresar volverás automáticamente al paso en el que estabas.
          </span>
        </Alert>
      )}

      {submitError && (
        <Alert
          variant="danger"
          title="No pudimos iniciar sesión"
          onClose={() => setSubmitError('')}
        >
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-6">
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            autoFocus
            error={errors.email?.message}
            hint="Usa el correo con el que creaste tu cuenta"
            reserveHelperSpace
            startAdornment={<Mail className="size-[18px]" />}
            {...register('email')}
          />

          <div>
            <Input
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              error={errors.password?.message}
              hint="La contraseña distingue mayúsculas y minúsculas"
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
            <div className="mt-2 text-right">
              <Link
                to={ROUTES.forgotPassword}
                className="text-xs font-extrabold text-brand-700 underline-offset-4 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === 'loading'}
            isLoading={status === 'loading'}
            leftIcon={<ArrowRight className="size-4" />}
          >
            {status === 'loading' ? 'Ingresando…' : 'Ingresar a mi cuenta'}
          </Button>
        </div>
      </form>

      <AuthFormFooter
        prompt="¿Primera vez en Misky Challay?"
        linkLabel="Crea tu cuenta gratis"
        to={ROUTES.register}
        from={from}
      />
    </AuthShell>
  );
};

export default LoginPage;
