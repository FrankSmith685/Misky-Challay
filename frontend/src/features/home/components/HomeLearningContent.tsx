import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CakeSlice,
  Check,
  ChevronDown,
  Gift,
  MessageCircle,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import type { StorefrontContent } from '../content/storefront.schema';
import { HomeHero } from './HomeHero';
import { HomeBenefits } from './HomeBenefits';
import { HomeFeaturedMenu } from './HomeFeaturedMenu';

const CHOICE_ICONS = [CakeSlice, Sparkles, Building2];
const actionRoute = (action: StorefrontContent['choices'][number]['action']): string => ({
  catalog: ROUTES.menu, custom: ROUTES.customCake, business: ROUTES.business, plans: ROUTES.plans,
  experiences: ROUTES.cakeAr, cart: ROUTES.cart, coverage: ROUTES.coverage, orders: ROUTES.accountOrders,
  guide: ROUTES.howToOrder, whatsapp: ROUTES.howToOrder,
}[action ?? 'catalog']);
type Section = StorefrontContent['sections'][number];

export const OrderFaq = ({ faqs }: { faqs: StorefrontContent['faqs'] }) => (
  <div className="divide-y divide-line border-y border-line">
    {faqs.map((faq) => (
      <details key={faq.id} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-base font-semibold text-ink marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
          {faq.question}
          <ChevronDown
            className="size-4 shrink-0 text-brand-700 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <p className="max-w-3xl pb-6 pr-7 text-sm leading-7 text-ink-muted">{faq.answer}</p>
      </details>
    ))}
  </div>
);

export const WalkthroughCards = ({ steps }: { steps: StorefrontContent['walkthrough'] }) => (
  <ol className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
    {steps.map((step, index) => (
      <li key={index} className="min-w-0 overflow-hidden rounded-card border border-line bg-white">
        <figure className="border-b border-line bg-surface-muted p-3">
          <img
            src={step.imageUrl}
            alt={step.imageAlt}
            width="640"
            height="420"
            loading="lazy"
            className="aspect-[3/2] w-full rounded-card border border-line bg-white object-contain object-top"
          />
        </figure>
        <div className="p-5">
          <span className="text-xs font-extrabold tracking-widest text-brand-700">
            0{index + 1}
          </span>
          <h3 className="mt-3 text-base font-bold leading-6 text-ink">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{step.description}</p>
        </div>
      </li>
    ))}
  </ol>
);

const ContactContent = ({ section }: { section: Section }) => {
  const business = useBusinessInfo();
  const whatsapp = whatsappLink(
    business.whatsappPhone ?? business.phone,
    'Hola, necesito orientación para hacer un pedido en Misky Challay.',
  );
  return (
    <MarketingSection id="ayuda-para-pedir" tone="brand" contentClassName="py-12 sm:py-16">
      <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
            Te acompañamos
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-ink">{section.title}</h2>
          <p className="mt-3 text-base leading-7 text-ink-muted">{section.description}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <Button
            component={Link}
            to={ROUTES.howToOrder}
            variant="outline"
            leftIcon={<BookOpen className="size-4" aria-hidden="true" />}
          >
            Ver la guía completa
          </Button>
          {whatsapp && (
            <Button
              component="a"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              leftIcon={<MessageCircle className="size-4" aria-hidden="true" />}
            >
              Consultar por WhatsApp
            </Button>
          )}
        </div>
      </div>
    </MarketingSection>
  );
};

const HomeSection = ({
  section,
  content,
  preview,
}: {
  section: Section;
  content: StorefrontContent;
  preview: boolean;
}) => {
  if (section.id === 'contact') return <ContactContent section={section} />;
  if (section.id === 'featured')
    return preview ? (
      <MarketingSection>
        <MarketingHeading
          eyebrow="Catálogo conectado"
          title={section.title}
          description={section.description}
        />
        <p className="mt-7 border border-line bg-surface-muted p-5 text-sm text-ink-muted">
          Aquí aparecen los productos destacados publicados en el catálogo, con su precio y
          disponibilidad.
        </p>
      </MarketingSection>
    ) : (
      <HomeFeaturedMenu title={section.title} description={section.description} productIds={content.featuredProductIds} />
    );
  return (
    <MarketingSection
      id={section.id === 'abc' ? 'como-hacer-tu-pedido' : section.id}
      tone={section.id === 'walkthrough' || section.id === 'extras' ? 'soft' : 'white'}
    >
      <MarketingHeading
        eyebrow={
          section.id === 'abc'
            ? 'El ABC de tu pedido'
            : section.id === 'walkthrough'
              ? 'Conoce el personalizador'
              : section.id === 'faq'
                ? 'Preguntas frecuentes'
                : 'Para cada ocasión'
        }
        title={section.title}
        description={section.description}
        className="max-w-3xl"
      />
      <div className="mt-9 sm:mt-11">
        {section.id === 'abc' && (
          <>
            <ol className="grid gap-5 lg:grid-cols-3">
              {content.abc.map((step, i) => (
                <li
                  key={i}
                  className="relative min-w-0 rounded-card border border-line bg-surface-muted/50 p-6 sm:p-7"
                >
                  <span
                    className="grid size-12 place-items-center rounded-card bg-brand-700 text-xl font-bold text-white"
                    aria-label={`Paso ${i + 1}`}
                  >
                    {['A', 'B', 'C'][i]}
                  </span>
                  <h3 className="mt-6 text-xl font-bold leading-7 text-ink">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
            <Link
              to={ROUTES.howToOrder}
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
            >
              Ver todos los pasos y consejos
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </>
        )}
        {section.id === 'walkthrough' && (
          <>
            <WalkthroughCards steps={content.walkthrough} />
            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
              <p className="flex items-start gap-2 text-xs leading-6 text-ink-muted">
                <Check className="mt-1 size-4 shrink-0 text-brand-700" aria-hidden="true" />
                Capturas del personalizador. Las opciones y precios disponibles se consultan al
                crear tu torta.
              </p>
              <Button component={Link} to={ROUTES.customCake} variant="outline">
                Empezar a personalizar
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </div>
          </>
        )}
        {section.id === 'choices' && (
          <div className="grid gap-5 lg:grid-cols-3">
            {content.choices.map((item, i) => {
              const Icon = CHOICE_ICONS[i];
              const target = actionRoute(item.action ?? (['catalog', 'custom', 'business'] as const)[i]);
              return (
                <article
                  key={i}
                  className="flex min-w-0 flex-col rounded-card border border-line p-6 sm:p-7"
                >
                  <Icon className="size-7 text-brand-600" aria-hidden="true" />
                  <h3 className="mt-5 text-xl font-bold leading-7">{item.title}</h3>
                  <p className="mb-7 mt-3 text-sm leading-7 text-ink-muted">{item.description}</p>
                  <Link
                    to={target}
                    className="mt-auto inline-flex min-h-11 items-center justify-between gap-3 border-t border-line pt-4 text-sm font-semibold text-brand-700"
                  >
                    {item.label}
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
        {section.id === 'extras' && (
          <div className="grid gap-5 md:grid-cols-2">
            {content.extras.map((item, i) => {
              const Icon = i ? QrCode : Gift;
              const target = actionRoute(item.action ?? (['plans', 'experiences'] as const)[i]);
              return (
                <article
                  key={i}
                  className="flex min-w-0 items-start gap-5 rounded-card border border-line bg-white p-6 sm:p-8"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold leading-7">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-ink-muted">{item.description}</p>
                    <Link
                      to={target}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700"
                    >
                      {item.label}
                      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {section.id === 'faq' && <OrderFaq faqs={content.faqs} />}
      </div>
    </MarketingSection>
  );
};

export const HomeEditorial = ({
  content,
  preview = false,
}: {
  content: StorefrontContent;
  preview?: boolean;
}) => (
  <>
    <HomeHero hero={content.hero} content={content} />
    <HomeBenefits benefits={content.benefits} />
    {content.sections
      .filter((section) => section.enabled)
      .map((section) => (
      <HomeSection key={section.id} section={section} content={content} preview={preview} />
      ))}
  </>
);
