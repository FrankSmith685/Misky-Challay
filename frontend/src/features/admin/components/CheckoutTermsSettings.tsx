import { subscriptionTermsApi } from '@services/customerJourney';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkoutTermsApi, type CheckoutTerms } from '@services/checkoutTerms';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import toast from '@components/mui/MuiToast';

export function CheckoutTermsSettings({ subscription = false }: { subscription?: boolean }) {
  const termsApi = subscription ? subscriptionTermsApi : checkoutTermsApi;
  const [published, setPublished] = useState<CheckoutTerms | null>(null);
  const [form, setForm] = useState<CheckoutTerms | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const load = async () => {
    try { const data = await termsApi.get(); setPublished(data); setForm(data); setError(''); }
    catch (caught) { setError(getApiErrorMessage(caught)); }
  };
  useEffect(() => { void load(); }, [subscription]);
  const publish = async () => {
    if (!form || saving) return;
    if (form.title.trim().length < 3 || form.content.trim().length < 50 || form.acceptanceLabel.trim().length < 10) {
      setError('Completa el título, las condiciones (al menos 50 caracteres) y el texto de aceptación (al menos 10 caracteres).'); return;
    }
    setSaving(true);
    try {
      const data = await termsApi.publish(form);
      setPublished(data); setForm(data); setError(''); toast.success(`Términos publicados. Versión ${data.version}.`);
    } catch (caught) { setError(getApiErrorMessage(caught)); }
    finally { setSaving(false); }
  };
  const dirty = Boolean(form && published && (form.title !== published.title || form.content !== published.content || form.acceptanceLabel !== published.acceptanceLabel));
  return (
    <section className="grid gap-5 rounded-card border border-line bg-white p-5" aria-label="Términos de compra">
      <div><h2 className="text-lg font-bold">Términos y condiciones de compra</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Publica el contenido que debe aceptar el cliente al confirmar su pedido en web y app. Cada cambio genera una nueva versión. Los pedidos conservan el texto que se aceptó en su momento.</p></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!form ? <Button onClick={() => void load()}>Cargar términos</Button> : <>
        <p className="text-sm text-ink-muted">Versión publicada: {published?.version} · {new Date(form.publishedAt).toLocaleString('es-PE')}</p>
        <Input label="Título del documento" maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={saving} />
        <Textarea label="Contenido de los términos" rows={18} maxLength={60000} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} disabled={saving} />
        <Input label="Texto de la casilla de aceptación" maxLength={300} value={form.acceptanceLabel} onChange={(event) => setForm({ ...form, acceptanceLabel: event.target.value })} disabled={saving} />
        <p className="text-xs leading-5 text-ink-muted">El contenido se muestra como texto, respetando los saltos de línea. Incluye los datos del negocio que correspondan al documento. La aceptación siempre es obligatoria y comienza desmarcada.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void publish()} disabled={!dirty} isLoading={saving}>Publicar nueva versión</Button>
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>Vista previa</Button>
          <Button variant="ghost" disabled={saving} onClick={() => void load()}>Recargar publicación</Button>
          <Link to={subscription ? '/terminos?documento=suscripcion' : ROUTES.terms} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-700 underline">Ver documento público</Link>
        </div>
        {showPreview && <article className="rounded-card border border-line p-5"><h3 className="text-xl font-bold">{form.title}</h3><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{form.content}</p><p className="mt-5 border-t border-line pt-4 text-sm">☐ {form.acceptanceLabel}</p></article>}
      </>}
    </section>
  );
}
