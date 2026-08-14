import { useEffect } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';

/** Puente HTTPS controlado para volver desde la pasarela a la compra móvil del plan. */
const MobilePlanReturnPage = () => {
  const [params] = useSearchParams();
  const planId = params.get('plan') ?? '';
  const result = params.get('resultado') === 'cancelado' ? 'cancelado' : 'aprobado';
  const appUrl = `verdebowl://plans/result?planId=${encodeURIComponent(planId)}&payment=${result}`;

  useEffect(() => {
    if (planId) window.location.replace(appUrl);
  }, [appUrl, planId]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-12">
      <Card className="w-full text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-card bg-brand-50 text-brand-700"><Smartphone className="size-8" /></span>
        <h1 className="mt-5 text-2xl font-black">Volviendo a Verde Bowl</h1>
        <p className="mt-2 text-sm text-ink-muted">Estamos comprobando la activación de tu plan. Si la aplicación no se abrió, usa el botón.</p>
        <Button className="mt-6 w-full" leftIcon={<ExternalLink className="size-4" />} onClick={() => window.location.assign(appUrl)} disabled={!planId}>Abrir la aplicación</Button>
        <Link className="mt-4 block text-sm font-bold text-brand-700" to={`/cuenta/saldo?plan=${encodeURIComponent(planId)}`}>Continuar en la web</Link>
      </Card>
    </main>
  );
};

export default MobilePlanReturnPage;
