import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowUpRight, Copy, Download, QrCode } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import toast from '@components/mui/MuiToast';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';
import { buildArtifactUrl, buildRenzoUrl, RENZO_TEMPLATE } from './renzo-artifact/data/template';

export default function RenzoArtifactQrPage() {
  const { slug = RENZO_TEMPLATE.slug } = useParams();
  const [qr, setQr] = useState('');
  const url = slug === RENZO_TEMPLATE.slug
    ? buildRenzoUrl(publicCakeWebOrigin(), 'card')
    : buildArtifactUrl(publicCakeWebOrigin(), slug, 'card');

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, {
      width: 520,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#003a60', light: '#ffffff' },
    }).then((value) => {
      if (active) setQr(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [url]);

  const downloadQr = () => {
    if (!qr) return;
    const link = document.createElement('a');
    link.href = qr;
    link.download = `qr-tarjeta-${slug}.png`;
    link.click();
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  };

  return (
    <section className="container-shell py-10 sm:py-16" aria-label="QR del artefacto de Renzo">
      <div className="mx-auto grid max-w-4xl gap-8 rounded-card border border-line bg-white p-6 shadow-e3 sm:grid-cols-[280px_1fr] sm:p-10">
        <div className="grid place-items-center rounded-card bg-brand-50 p-5">
          {qr ? <img src={qr} alt="Código QR para abrir directamente la tarjeta de Renzo" className="w-full max-w-[240px]" /> : <QrCode size={100} className="text-brand-300" />}
        </div>
        <div className="flex flex-col justify-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Misky Challay · QR de prueba</p>
          <h1 className="text-3xl font-extrabold text-ink">Experiencia web de Renzo</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-muted">
            Escanea el código para abrir directamente la tarjeta personalizada en el navegador. No requiere instalar una aplicación.
          </p>
          <p className="mt-4 break-all rounded-field border border-line bg-surface-muted p-3 text-xs text-ink-muted">{url}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button component="a" href={url} target="_blank" rel="noreferrer" leftIcon={<ArrowUpRight size={15} />}>Abrir tarjeta</Button>
            <Button variant="outline" leftIcon={<Copy size={15} />} onClick={() => void copyUrl()}>Copiar enlace</Button>
            <Button variant="ghost" leftIcon={<Download size={15} />} onClick={downloadQr}>Descargar QR</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
