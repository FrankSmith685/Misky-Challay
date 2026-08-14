import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, TriangleAlert } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { checkoutApi } from '../services/checkout.service';

/**
 * SIMULADOR DE PAGO (solo desarrollo).
 * Ocupa el lugar de la pagina de Stripe mientras no haya claves. Al pulsar un
 * boton se dispara el webhook FIRMADO del backend: el mismo camino que usara
 * Stripe. Cuando se configuren las claves, esta pantalla deja de aparecer.
 */
const PaymentSimulatorPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const providerReference = params.get('ref') ?? '';
  const total = Number(params.get('total') ?? 0);
  const orderNumber = params.get('pedido') ?? '';
  const returnUrl = params.get('retorno');

  const handle = async (outcome: 'pay' | 'fail') => {
    setIsProcessing(true);
    try {
      await checkoutApi.simulatePayment(providerReference, outcome);
      if (returnUrl) window.location.assign(returnUrl);
      else navigate(`${ROUTES.checkoutSuccess}?pedido=${orderNumber}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <div className="flex items-start gap-2 rounded-xl bg-accent-400/10 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-500" />
          <p className="text-xs text-ink-muted">
            Simulador de pago (solo desarrollo). Configura <code>STRIPE_SECRET_KEY</code> en{' '}
            <code>backend/.env</code> y esta pantalla se reemplaza por la de Stripe.
          </p>
        </div>

        <CardTitle className="mt-5">Pedido {orderNumber}</CardTitle>
        <CardDescription className="mt-1">Total a pagar</CardDescription>
        <p className="mt-1 text-3xl font-bold text-brand-700">{formatCurrency(total)}</p>

        <div className="mt-6 grid gap-2">
          <Button
            className="w-full"
            size="lg"
            leftIcon={<CreditCard className="size-4" />}
            isLoading={isProcessing}
            onClick={() => handle('pay')}
          >
            Simular pago aprobado
          </Button>

          <Button
            className="w-full"
            variant="outline"
            disabled={isProcessing}
            onClick={() => handle('fail')}
          >
            Simular tarjeta rechazada
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PaymentSimulatorPage;
