import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Alert, Button, Checkbox, Input } from '@components/ui';
import { useAppDispatch, useAppSelector, useAppStore } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { register as registerThunk } from '../authSlice';
import { readReturnTo, resolveAfterAuthPath } from '../authRedirect';
import { AuthFormFooter } from '../components/AuthFormFooter';
import { AuthShell } from '../components/AuthShell';
import { PasswordMatchStatus } from '../components/PasswordMatchStatus';
import { PasswordStrength } from '../components/PasswordStrength';

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Escribe al menos 2 caracteres'),
    lastName: z.string().trim().min(2, 'Escribe al menos 2 caracteres'),
    email: z
      .string()
      .trim()
      .min(1, 'Ingresa tu correo electrónico')
      .email('Ingresa un correo electrónico válido'),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{6,20}$/, 'Ingresa un teléfono válido')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Usa al menos 8 caracteres')
      .regex(/[A-Z]/, 'Incluye al menos una mayúscula')
      .regex(/\d/, 'Incluye al menos un número'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
    acceptedTerms: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.acceptedTerms === true, {
    message: 'Debes aceptar los términos y la política de privacidad',
    path: ['acceptedTerms'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

const RegisterPage = () => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  /** De donde venia: el carrito manda aqui a quien necesita cuenta para pedir. */
  const from = readReturnTo(location);
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    },
  });

  const password = watch('password', '');
  const confirmation = watch('confirmPassword', '');

  const onSubmit = async (values: RegisterForm) => {
    setSubmitError('');
    const result = await dispatch(
      registerThunk({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
        phone: values.phone?.trim() || undefined,
        acceptedTerms: values.acceptedTerms,
      }),
    );

    if (registerThunk.fulfilled.match(result)) {
      toast.success('Cuenta creada. ¡Bienvenido a Misky Challay!');
      // Si llego aqui desde el carrito para poder confirmar su pedido, vuelve alli.
      // Una cuenta recien creada nunca es del equipo, asi que el destino base es la portada.
      navigate(resolveAfterAuthPath(from, false, ROUTES.admin, store.getState().cart.items.length > 0), { replace: true });
      return;
    }

    setSubmitError(result.payload ?? 'No se pudo crear la cuenta');
  };

  return (
    <AuthShell
      wide
      eyebrow="Únete a Misky Challay"
      title="Crea tu cuenta"
      description="Guarda tus datos una vez y disfruta una compra más rápida y personalizada."
    >
      {submitError && (
        <Alert
          variant="danger"
          title="No pudimos crear tu cuenta"
          onClose={() => setSubmitError('')}
        >
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-6">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-xs font-black text-brand-700">
                1
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-ink">Tus datos</h2>
                <p className="text-[11px] text-ink-muted">Para identificar y coordinar tus pedidos.</p>
              </div>
            </div>

            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <Input
                label="Nombre"
                autoComplete="given-name"
                autoFocus
                error={errors.firstName?.message}
                reserveHelperSpace
                startAdornment={<UserRound className="size-[18px]" />}
                {...register('firstName')}
              />
              <Input
                label="Apellido"
                autoComplete="family-name"
                error={errors.lastName?.message}
                reserveHelperSpace
                {...register('lastName')}
              />
              <Input
                className="sm:col-span-2"
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                error={errors.email?.message}
                hint="Aquí recibirás confirmaciones y recuperación de acceso"
                reserveHelperSpace
                startAdornment={<Mail className="size-[18px]" />}
                {...register('email')}
              />
              <Input
                className="sm:col-span-2"
                label="Teléfono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="999 999 999"
                error={errors.phone?.message}
                hint="Opcional · solo lo usaremos para coordinar tus pedidos"
                reserveHelperSpace
                startAdornment={<Phone className="size-[18px]" />}
                {...register('phone')}
              />
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-xs font-black text-brand-700">
                2
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-ink">Protege tu cuenta</h2>
                <p className="text-[11px] text-ink-muted">Crea una contraseña difícil de adivinar.</p>
              </div>
            </div>

            <div className="grid items-start gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <Input
                  label="Contraseña"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
                <PasswordMatchStatus
                  password={password}
                  confirmation={confirmation}
                  reserveSpace={false}
                />
              </div>
            </div>
          </section>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/55 px-3 py-2.5 sm:px-4">
            <Checkbox
              label={
                <span className="text-xs leading-5 text-ink-muted">
                  He leído y acepto los{' '}
                  <Link
                    to={ROUTES.terms}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-brand-700 hover:underline"
                  >
                    Términos y Condiciones
                  </Link>{' '}
                  y la{' '}
                  <Link
                    to={ROUTES.privacy}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-brand-700 hover:underline"
                  >
                    Política de Privacidad
                  </Link>
                  .
                </span>
              }
              {...register('acceptedTerms')}
            />
            {errors.acceptedTerms && (
              <p className="mt-1 pl-8 text-xs font-semibold leading-5 text-red-600" role="alert">
                {errors.acceptedTerms.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === 'loading'}
            isLoading={status === 'loading'}
            leftIcon={<ArrowRight className="size-4" />}
          >
            {status === 'loading' ? 'Creando cuenta…' : 'Crear mi cuenta'}
          </Button>
        </div>
      </form>

      <AuthFormFooter
        prompt="¿Ya tienes una cuenta?"
        linkLabel="Inicia sesión"
        to={ROUTES.login}
        from={from}
      />
    </AuthShell>
  );
};

export default RegisterPage;
