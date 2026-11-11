import { ArrowLeft, QrCode, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import RenzoArtifactApp from './renzo-artifact/App';
import './renzo-artifact/index.css';

export default function RenzoArtifactPage() {
  return (
    <section className="container-shell py-5 sm:py-8" aria-label="Artefacto web de Renzo">
      <div className="mx-auto w-full max-w-[96rem]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Button component={Link} to="/experiencias/renzo-qr" variant="ghost" size="sm" className="w-full sm:w-auto" leftIcon={<QrCode size={15} />}>
            Ver QR de esta experiencia
          </Button>
          <Button component={Link} to="/empresas" variant="ghost" size="sm" className="w-full sm:w-auto" leftIcon={<ArrowLeft size={15} />}>
            Volver a Misky Challay
          </Button>
        </div>
        <div className="overflow-hidden rounded-card border border-line shadow-e3">
          <RenzoArtifactApp />
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-ink-muted">
          <Share2 size={13} aria-hidden="true" />
          Esta es una experiencia web de prueba; el QR abre esta misma página desde un dominio público.
        </p>
      </div>
    </section>
  );
}
