import { DATA_CHANGED } from '@services/realtime';
import { useEffect, useState } from 'react';
import { Button } from '@components/ui/Button';
import { Textarea } from '@components/ui/Textarea';
import { CheckCircle2, MessageSquare, QrCode, Send } from 'lucide-react';
import { Alert } from '@components/ui/Alert';
import { ExperiencePanel, ExperienceProgress, ExperienceStatus } from './ExperienceUI';
import { getApiErrorMessage } from '@services/api/client';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';
import { experiencesApi, type ExperienceCustomer } from './experiences.service';
import { useExperienceMedia } from './useExperienceMedia';
import { ExperienceViewer } from './ExperienceViewer';

export function OrderExperienceCard({ orderNumber }: { orderNumber: string }) {
  const [data, setData] = useState<ExperienceCustomer | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    const refresh = () => {
      if (document.hidden) return;
      void experiencesApi
        .customer(orderNumber)
        .then((value) => {
          if (active) {
            setData(value);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('No se pudo actualizar el seguimiento de la experiencia QR.');
        });
    };
    const onEvent = (event: Event) => { if ((event as CustomEvent<string[]>).detail?.some((topic) => ['experiences', 'resync'].includes(topic))) refresh(); };
    window.addEventListener(DATA_CHANGED, onEvent);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(DATA_CHANGED, onEvent);
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh);
    };
  }, [orderNumber]);
  const {
    media,
    loading,
    error: mediaError,
  } = useExperienceMedia(
    data?.scene ?? null,
    `/experiences/orders/${encodeURIComponent(orderNumber)}`,
  );
  if (!data)
    return error ? (
      <p role="alert" className="text-sm text-red-700">
        {error}
      </p>
    ) : null;
  const review = async (approve: boolean) => {
    setBusy(true);
    setError('');
    try {
      await experiencesApi.review(orderNumber, {
        expectedVersion: data.version,
        approve,
        feedback,
      });
      setData(await experiencesApi.customer(orderNumber));
      setFeedback('');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const expired = Boolean(
    data.previewExpiresAt && new Date(data.previewExpiresAt).getTime() <= Date.now(),
  );
  return (
    <ExperiencePanel
      icon={QrCode}
      title="Tu experiencia QR"
      description={`${data.package.name} · Versión ${data.version}`}
      action={<ExperienceStatus status={data.status} />}
    >
      <ExperienceProgress status={data.status} />
      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3 rounded-field border border-line bg-surface-muted p-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand-600" />
          <span>Tu aprobación y el pago verificado habilitan la publicación.</span>
        </p>
        <span className="text-[11px] font-semibold text-brand-700">
          Revisiones: {data.revisionsUsed} de {data.package.revisionsIncluded}
        </span>
      </div>
      {data.scene &&
        (loading ? (
          <div
            role="status"
            className="grid h-52 place-items-center rounded-field bg-brand-50 text-sm text-ink-muted"
          >
            Cargando propuesta…
          </div>
        ) : mediaError ? (
          <Alert variant="danger">{mediaError}</Alert>
        ) : (
          <ExperienceViewer
            scene={data.scene}
            media={media}
            mode={data.package.mode}
            expiresAt={data.expiresAt}
            url={
              data.publicToken
                ? `${publicCakeWebOrigin()}/experiencias/${data.publicToken}?camera=1`
                : undefined
            }
          />
        ))}
      {data.status === 'AWAITING_APPROVAL' && (
        <div className="mt-6 grid gap-4 rounded-field border border-brand-100 bg-brand-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="exp-icon bg-white">
              <MessageSquare size={17} />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-ink">
                Tu propuesta está lista para revisar
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Revisa el video, la dedicatoria y la escena antes de confirmar.
              </p>
            </div>
          </div>
          {expired && (
            <Alert variant="warning" title="El plazo de revisión venció">
              El plazo de revisión venció. Contacta con el taller para recibir una propuesta
              vigente.
            </Alert>
          )}
          <Textarea
            label="Comentarios o cambios solicitados"
            value={feedback}
            maxLength={1000}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              leftIcon={<CheckCircle2 size={15} />}
              disabled={busy || expired}
              onClick={() => void review(true)}
            >
              Aprobar esta versión
            </Button>
            <Button
              variant="outline"
              leftIcon={<Send size={15} />}
              disabled={
                busy ||
                expired ||
                !feedback.trim() ||
                data.revisionsUsed >= data.package.revisionsIncluded
              }
              onClick={() => void review(false)}
            >
              Solicitar cambios
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            La aprobación corresponde a la propuesta que estás viendo. Cualquier cambio posterior
            requiere una nueva aprobación.
          </p>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
    </ExperiencePanel>
  );
}
