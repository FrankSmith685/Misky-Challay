import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, Mail, MailCheck } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Alert, Button, Input } from '@components/ui';
import { useAppDispatch } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { requestPasswordReset } from '../authSlice';
import { AuthFormFooter } from '../components/AuthFormFooter';
import { AuthShell } from '../components/AuthShell';

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa tu correo electrónico')
    .email('Ingresa un correo electrónico válido'),
});

type ForgotForm = z.infer<typeof schema>;

const ForgotPasswordPage = () => {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotForm) => {
    setLoading(true);
    setSubmitError('');
    const result = await dispatch(requestPasswordReset({ email: values.email.trim() }));
    setLoading(false);

    if (requestPasswordReset.fulfilled.match(result)) {
      setSent(true);
      return;
    }

    const message = result.payload ?? 'No se pudo procesar la solicitud';
    setSubmitError(message);
    toast.error(message);
  };

  return (
    <AuthShell
      eyebrow={sent ? 'Solicitud completada' : 'Recuperar acceso'}
      title={sent ? 'Revisa tu correo' : 'Recupera tu contraseña'}
      description={
        sent
          ? 'Si existe una cuenta con ese correo, recibirás las instrucciones en unos minutos.'
          : 'Escribe el correo de tu cuenta y te enviaremos un enlace seguro para crear una contraseña nueva.'
      }
    >
      {sent ? (
        <div className="grid gap-5">
          <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 text-center sm:p-6">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-e1">
              <MailCheck className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-black text-ink">Enlace solicitado</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Por seguridad mostramos este mismo resultado exista o no una cuenta registrada.
            </p>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-white p-3 text-left text-xs leading-5 text-ink-muted ring-1 ring-brand-100">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-brand-700" />
              El enlace vence en 60 minutos. Revisa también las carpetas de spam o promociones.
            </div>
          </div>

          <Button
            component={Link}
            to={ROUTES.login}
            size="lg"
            className="w-full"
            leftIcon={<ArrowLeft className="size-4" />}
          >
            Volver a iniciar sesión
          </Button>
        </div>
      ) : (
        <>
          {submitError && (
            <Alert
              variant="danger"
              title="No pudimos enviar el enlace"
              onClose={() => setSubmitError('')}
            >
              {submitError}
            </Alert>
          )}

          <Alert variant="info">
            <span className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Nunca te pediremos tu contraseña actual por correo.
            </span>
          </Alert>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-6">
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                autoFocus
                error={errors.email?.message}
                hint="El correo con el que creaste tu cuenta"
                reserveHelperSpace
                startAdornment={<Mail className="size-[18px]" />}
                {...register('email')}
              />

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={loading}
                isLoading={loading}
                leftIcon={<MailCheck className="size-4" />}
              >
                {loading ? 'Enviando…' : 'Enviarme el enlace'}
              </Button>
            </div>
          </form>

          <AuthFormFooter
            prompt="¿Recordaste tu contraseña?"
            linkLabel="Inicia sesión"
            to={ROUTES.login}
          />
        </>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordPage;
