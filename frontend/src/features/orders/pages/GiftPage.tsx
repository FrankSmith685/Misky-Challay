import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '@services/api/client';
import { Button } from '@components/ui/Button';
interface Gift {
  recipientName: string;
  message?: string;
  status: string;
  scheduledAt?: string;
  grandTotal?: number;
  items: Array<{
    productNameSnapshot: string;
    quantity: number;
    designDetailsJson?: { inscription?: string };
  }>;
}
export default function GiftPage() {
  const { token } = useParams();
  const [data, setData] = useState<Gift | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api
      .get(`/customer/gifts/${encodeURIComponent(token ?? '')}`)
      .then(({ data: response }) => {
        if (active) setData(response.data);
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-5 py-12" aria-labelledby="gift-title">
      <h1 id="gift-title" className="text-3xl font-bold">
        Un regalo para {data?.recipientName ?? 'ti'}
      </h1>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p className="whitespace-pre-wrap text-xl">{data.message}</p>
          <p>
            Estado:{' '}
            {(
              {
                PENDING_PAYMENT: 'En coordinación',
                CONFIRMED: 'Confirmado',
                PREPARING: 'En preparación',
                READY: 'Listo',
                OUT_FOR_DELIVERY: 'En camino',
                DELIVERED: 'Entregado',
                CANCELLED: 'Cancelado',
                REFUNDED: 'Cancelado',
              } as Record<string, string>
            )[data.status] ?? 'En coordinación'}
          </p>
          {data.scheduledAt && (
            <p>Fecha programada: {new Date(data.scheduledAt).toLocaleString('es-PE')}</p>
          )}
          <ul>
            {data.items.map((item, index) => (
              <li key={index} className="rounded-card border border-line p-4">
                {item.quantity} × {item.productNameSnapshot}
                {item.designDetailsJson?.inscription && <p>{item.designDetailsJson.inscription}</p>}
              </li>
            ))}
          </ul>
          {data.grandTotal !== undefined && (
            <p>Importe del regalo: S/ {Number(data.grandTotal).toFixed(2)}</p>
          )}
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(window.location.href)}
          >
            Copiar enlace del regalo
          </Button>
        </>
      )}
    </section>
  );
}
