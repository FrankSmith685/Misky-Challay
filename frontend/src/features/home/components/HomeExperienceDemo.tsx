import { Link } from 'react-router-dom';
import { PlayCircle, QrCode, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

export const HomeExperienceDemo = () => (
  <section className="container-shell pb-8 sm:pb-12" aria-labelledby="home-experience-demo-title">
    <div className="grid overflow-hidden rounded-card border border-accent-200 bg-gradient-to-br from-brand-50 via-white to-accent-50 shadow-e2 lg:grid-cols-[1.1fr_.9fr]">
      <div className="p-6 sm:p-8 lg:p-10">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
          <Sparkles className="size-4 text-accent-600" aria-hidden="true" />
          Demo interactiva
        </p>
        <h2 id="home-experience-demo-title" className="mt-3 max-w-2xl text-2xl font-black tracking-tight text-ink sm:text-3xl">
          Mira cómo una torta se convierte en un recuerdo
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">
          Explora una experiencia de video personalizada, prueba la tarjeta de dedicatoria y descubre cómo funciona el QR que puede acompañar tu celebración.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button component={Link} to={ROUTES.experienceDemo} leftIcon={<PlayCircle className="size-4" aria-hidden="true" />}>
            Ver demo de video
          </Button>
          <Button component={Link} to={ROUTES.experienceDemoQr} variant="outline" leftIcon={<QrCode className="size-4" aria-hidden="true" />}>
            Ver el QR
          </Button>
        </div>
        <p className="mt-4 text-xs text-ink-muted">Demostración gratuita · No genera pedidos ni cobros.</p>
      </div>
      <figure className="relative min-h-56 overflow-hidden border-t border-accent-100 bg-brand-900/5 lg:border-l lg:border-t-0">
        <img
          src="/brand/misky-challay-tech-web.webp"
          alt="Vista previa de una experiencia digital de Misky Challay"
          width="1024"
          height="683"
          loading="lazy"
          decoding="async"
          className="h-full min-h-56 w-full object-cover"
        />
        <figcaption className="absolute inset-x-4 bottom-4 rounded-xl border border-white/70 bg-white/90 px-4 py-3 text-xs font-semibold text-brand-800 shadow-e1 backdrop-blur sm:inset-x-6 sm:bottom-6">
          Video, dedicatoria y QR en una sola experiencia.
        </figcaption>
      </figure>
    </div>
  </section>
);
