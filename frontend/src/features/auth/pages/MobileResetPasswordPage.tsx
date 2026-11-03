import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, KeyRound, Smartphone } from 'lucide-react';
import { Alert, Button } from '@components/ui';
import { ROUTES } from '@constants/routes';
import { AuthShell } from '../components/AuthShell';

/**
 * Puente HTTPS -> app. Los correos no deben depender de que el sistema acepte
 * un esquema personalizado dentro del cliente de correo: llegan primero a esta
 * página segura, que abre la app y conserva una alternativa web completa.
 */
const MobileResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const appUrl = useMemo(
    () => `verdebowl://reset-password?token=${encodeURIComponent(token)}`,
    [token],
  );
  const webUrl = `${ROUTES.resetPassword}?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => window.location.assign(appUrl), 250);
    return () => window.clearTimeout(timer);
  }, [appUrl, token]);

  return (
    <AuthShell
      eyebrow="Recuperación desde la app"
      title={token ? 'Continúa en Misky Challay' : 'El enlace está incompleto'}
      description={
        token
          ? 'Estamos abriendo la app para que crees tu nueva contraseña de forma segura.'
          : 'Solicita un correo nuevo desde la app o desde la web.'
      }
    >
      {token ? (
        <>
          <Alert variant="success" title="Una cuenta para web y app">
            La contraseña nueva funcionará en ambos canales y cerrará las sesiones anteriores.
          </Alert>
          <Button
            component="a"
            href={appUrl}
            size="lg"
            className="w-full"
            leftIcon={<Smartphone className="size-4" />}
          >
            Abrir la app Misky Challay
          </Button>
          <Button
            component={Link}
            to={webUrl}
            variant="outline"
            size="lg"
            className="w-full"
            leftIcon={<ExternalLink className="size-4" />}
          >
            Continuar en esta web
          </Button>
        </>
      ) : (
        <Button
          component={Link}
          to={ROUTES.forgotPassword}
          size="lg"
          className="w-full"
          leftIcon={<KeyRound className="size-4" />}
        >
          Solicitar otro enlace
        </Button>
      )}
    </AuthShell>
  );
};

export default MobileResetPasswordPage;
