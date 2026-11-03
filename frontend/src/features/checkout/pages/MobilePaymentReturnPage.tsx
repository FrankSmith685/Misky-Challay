import { useEffect } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';

/** Puente de dominio propio: el proveedor recibe HTTPS, nunca una URL arbitraria del cliente. */
const MobilePaymentReturnPage = () => {
  const [params] = useSearchParams();
  const orderNumber = params.get('pedido') ?? '';
  const result = params.get('resultado') === 'cancelado' ? 'cancelado' : 'aprobado';
  const appUrl = `verdebowl://checkout/result?orderNumber=${encodeURIComponent(orderNumber)}&payment=${result}`;
  useEffect(() => { if (orderNumber) window.location.replace(appUrl); }, [appUrl, orderNumber]);
  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-12"><Card className="w-full text-center"><span className="mx-auto grid size-16 place-items-center rounded-card bg-brand-50 text-brand-700"><Smartphone className="size-8" /></span><h1 className="mt-5 text-2xl font-black">Volviendo a Misky Challay</h1><p className="mt-2 text-sm text-ink-muted">Pedido {orderNumber || 'desconocido'}. Si la aplicación no se abrió automáticamente, usa el botón.</p><Button className="mt-6 w-full" leftIcon={<ExternalLink className="size-4" />} onClick={() => window.location.assign(appUrl)} disabled={!orderNumber}>Abrir la aplicación</Button><Link className="mt-4 block text-sm font-bold text-brand-700" to={`/checkout/confirmacion?pedido=${encodeURIComponent(orderNumber)}${result === 'cancelado' ? '&pago=cancelado' : ''}`}>Continuar en la web</Link></Card></main>;
};
export default MobilePaymentReturnPage;
