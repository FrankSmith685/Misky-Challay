import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Mail, MessageCircle, Save, Smartphone } from 'lucide-react';
import { api, getApiErrorMessage } from '@services/api/client';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { AccountSectionCard } from './AccountSectionCard';

type Channels = { email: boolean; whatsapp: boolean; push: boolean };
type ChannelKey = keyof Channels;

const CHANNELS: Array<{ key: ChannelKey; label: string; detail: string; icon: typeof Mail }> = [
  { key: 'email', label: 'Correo electrónico', detail: 'Confirmaciones y novedades de tus pedidos.', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', detail: 'Solo cuando autorices el canal en un pedido.', icon: MessageCircle },
  { key: 'push', label: 'Teléfono', detail: 'Avisos rápidos si tienes la app instalada.', icon: Smartphone },
];

export function NotificationPreferences() {
  const [channels, setChannels] = useState<Channels | null>(null);
  const [initial, setInitial] = useState<Channels | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/customer/workspace');
      const value = data.data.channels as Channels;
      setChannels(value);
      setInitial(value);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = Boolean(channels && initial && CHANNELS.some(({ key }) => channels[key] !== initial[key]));

  const save = async () => {
    if (!channels || !dirty) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.put('/customer/channels', channels);
      setInitial(channels);
      setMessage('Preferencias guardadas.');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountSectionCard
      id="notificaciones-preferencias"
      icon={BellRing}
      title="Preferencias de avisos"
      description="Elige dónde quieres recibir novedades de tus pedidos."
      className="mb-6"
      action={<span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-white px-3 py-1.5 text-xs font-extrabold text-brand-700"><BellRing className="size-3.5" /> Canales</span>}
    >
      <p className="max-w-3xl text-sm leading-6 text-ink-muted">
        WhatsApp requiere autorización en cada pedido y que el negocio tenga el canal conectado. Los mensajes de seguridad y reclamos mantienen su propio recorrido.
      </p>

      {loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Skeleton className="h-28 rounded-card" /><Skeleton className="h-28 rounded-card" /><Skeleton className="h-28 rounded-card" /></div>
      ) : channels ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {CHANNELS.map(({ key, label, detail, icon: Icon }) => (
              <label key={key} className={`group flex cursor-pointer gap-3 rounded-card border p-4 transition ${channels[key] ? 'border-brand-300 bg-brand-50/60' : 'border-line bg-white hover:border-brand-200'}`}>
                <input type="checkbox" checked={channels[key]} onChange={(event) => setChannels({ ...channels, [key]: event.target.checked })} className="mt-1 size-4 accent-brand-700" />
                <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-extrabold text-ink"><Icon className="size-4 text-brand-700" />{label}</span><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></span>
              </label>
            ))}
          </div>
          {(message || error) && <p className={`mt-4 flex items-center gap-2 text-xs font-semibold ${error ? 'text-red-700' : 'text-brand-700'}`} role="status">{!error && <CheckCircle2 className="size-4" />}{error || message}</p>}
          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-ink-muted">Puedes cambiar estas preferencias cuando quieras.</p><Button className="w-full sm:w-auto" disabled={!dirty || saving} isLoading={saving} onClick={() => void save()} leftIcon={<Save className="size-4" />}>Guardar canales</Button></div>
        </>
      ) : (
        <div className="mt-5 rounded-card border border-red-200 bg-red-50/50 p-4 text-sm text-red-700" role="alert"><p>{error || 'No pudimos cargar tus canales.'}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Reintentar</Button></div>
      )}
    </AccountSectionCard>
  );
}
