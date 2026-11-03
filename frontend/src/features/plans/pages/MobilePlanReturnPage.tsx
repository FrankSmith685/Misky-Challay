import { useEffect } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';

const MobilePlanReturnPage = () => {
  const [params] = useSearchParams();
  const subscriptionId = params.get('subscription') ?? '';
  const planId = params.get('plan') ?? '';
  const result = params.get('resultado') === 'cancelado' ? 'cancelado' : 'aprobado';
  const appUrl = subscriptionId
    ? `verdebowl://plans/result?subscriptionId=${encodeURIComponent(subscriptionId)}`
    : `verdebowl://plans/result?planId=${encodeURIComponent(planId)}&payment=${result}`;
  const target = subscriptionId ? '/cuenta/suscripciones' : `/cuenta/saldo?plan=${encodeURIComponent(planId)}`;

  useEffect(() => {
    if (subscriptionId || planId) window.location.replace(appUrl);
  }, [appUrl, subscriptionId, planId]);

  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-12">
    <Card className="w-full text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-card bg-brand-50 text-brand-700"><Smartphone className="size-8" /></span>
      <h1 className="mt-5 text-2xl font-black">Volviendo a Misky Challay</h1>
      <p className="mt-2 text-sm text-ink-muted">Estamos comprobando tu suscripción. Si la aplicación no se abrió, usa el botón.</p>
      <Button className="mt-6 w-full" leftIcon={<ExternalLink className="size-4" />} onClick={() => window.location.assign(appUrl)} disabled={!subscriptionId && !planId}>Abrir la aplicación</Button>
      <Link className="mt-4 block text-sm font-bold text-brand-700" to={target}>Continuar en la web</Link>
    </Card>
  </main>;
};

export default MobilePlanReturnPage;
