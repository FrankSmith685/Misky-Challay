import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '@services/api/client';
import { Button } from '@components/ui/Button';
export function NotificationPreferences() {
  const [channels, setChannels] = useState<{
    email: boolean;
    whatsapp: boolean;
    push: boolean;
  } | null>(null);
  const [message, setMessage] = useState('');
  const load = () =>
    api
      .get('/customer/workspace')
      .then(({ data }) => setChannels(data.data.channels))
      .catch((error) => setMessage(getApiErrorMessage(error)));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="mt-6 space-y-3 rounded-card border border-line bg-white p-5">
      <h2 className="text-lg font-bold">Avisos de mis pedidos</h2>
      <p className="text-sm text-ink-muted">
        Elige tus canales. WhatsApp también requiere tu autorización en cada pedido y que el negocio
        tenga el canal conectado. Los mensajes de seguridad y reclamos mantienen su propio
        recorrido. Las promociones se gestionan por separado.
      </p>
      {message && <p role="status">{message}</p>}
      {channels ? (
        <>
          {(['email', 'whatsapp', 'push'] as const).map((channel) => (
            <label key={channel} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={channels[channel]}
                onChange={(event) => setChannels({ ...channels, [channel]: event.target.checked })}
              />
              {channel === 'email'
                ? 'Correo electrónico'
                : channel === 'whatsapp'
                  ? 'WhatsApp'
                  : 'Notificaciones en el teléfono'}
            </label>
          ))}
          <Button
            onClick={() =>
              void api
                .put('/customer/channels', channels)
                .then(() => setMessage('Preferencias guardadas.'))
                .catch((error) => setMessage(getApiErrorMessage(error)))
            }
          >
            Guardar canales
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => void load()}>
          Cargar preferencias
        </Button>
      )}
    </section>
  );
}
