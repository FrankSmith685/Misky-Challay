import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice, QrCode, Sparkles } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import type { StorefrontContent } from '../content/storefront.schema';

const fallbackCustom = {
  title: 'Diseña tu torta a tu manera',
  description: 'Combina tamaño, bizcocho, relleno y decoración con el precio actualizado en cada paso.',
  label: 'Crear mi torta',
};

const fallbackExperience = {
  title: 'Haz que tu torta cobre vida con AR',
  description: 'Convierte una celebración en un recuerdo con video, dedicatoria y una tarjeta digital enlazada a un QR.',
  label: 'Ver la experiencia AR',
};

export const HomeServicesSection = ({
  content,
  title = 'Nuestros servicios, a tu medida',
  description = 'Elige una torta diseñada por ti o añade una experiencia digital para compartirla.',
}: {
  content: StorefrontContent;
  title?: string;
  description?: string;
}) => {
  const custom = content.choices.find((item) => item.action === 'custom') ?? fallbackCustom;
  const experience = content.extras.find((item) => item.action === 'experiences') ?? fallbackExperience;

  return (
    <MarketingSection tone="white" contentClassName="py-10 sm:py-12 lg:py-20">
      <MarketingHeading eyebrow="Para cada celebración" title={title} description={description} />
      <div className="mt-7 grid gap-5 md:grid-cols-2 lg:mt-8">
        <article className="group overflow-hidden rounded-card border border-line bg-white shadow-e2 transition hover:-translate-y-1 hover:shadow-e3">
          <div className="relative aspect-[16/9] overflow-hidden bg-brand-50">
            <img src="/images/cakes/custom.png" alt="Torta personalizada de Misky Challay" loading="lazy" width="960" height="540" className="size-full object-cover transition duration-700 group-hover:scale-105" />
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.12em] text-brand-800 shadow-sm">
              <CakeSlice className="size-3.5" aria-hidden="true" /> Torta personalizada
            </span>
          </div>
          <div className="p-5 sm:p-7">
            <h3 className="text-2xl font-black tracking-tight text-ink">{custom.title}</h3>
            <p className="mt-3 text-sm leading-6 text-ink-muted sm:text-base">{custom.description}</p>
            <Button component={Link} to={ROUTES.customCake} size="lg" sx={{ mt: 3, width: { xs: '100%', sm: 'auto' } }}>
              {custom.label} <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Button>
          </div>
        </article>

        <article className="group overflow-hidden rounded-card border border-line bg-white shadow-e2 transition hover:-translate-y-1 hover:shadow-e3">
          <div className="relative aspect-[16/9] overflow-hidden bg-brand-50">
            <img src="/brand/misky-challay-tech-web.webp" alt="Experiencia digital de Misky Challay con QR" loading="lazy" width="1024" height="576" className="size-full object-cover transition duration-700 group-hover:scale-105" />
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.12em] text-brand-800 shadow-sm">
              <QrCode className="size-3.5" aria-hidden="true" /> Experiencia AR con QR
            </span>
          </div>
          <div className="p-5 sm:p-7">
            <h3 className="text-2xl font-black tracking-tight text-ink">{experience.title}</h3>
            <p className="mt-3 text-sm leading-6 text-ink-muted sm:text-base">{experience.description}</p>
            <Button component={Link} to={ROUTES.experienceDemo} size="lg" variant="outline" sx={{ mt: 3, width: { xs: '100%', sm: 'auto' } }}>
              <Sparkles className="mr-2 size-4" aria-hidden="true" /> {experience.label}
            </Button>
          </div>
        </article>
      </div>
    </MarketingSection>
  );
};
