import { ChevronDown } from 'lucide-react';
import type { StorefrontContent } from '../content/storefront.schema';
import { HomeHero } from './HomeHero';
import { HomeFeaturedMenu } from './HomeFeaturedMenu';
import { HomeCategoryShowcase } from './HomeCategoryShowcase';
import { HomePaymentMethods } from './HomePaymentMethods';
import { HomeServicesSection } from './HomeServicesSection';

export const OrderFaq = ({ faqs }: { faqs: StorefrontContent['faqs'] }) => (
  <div className="divide-y divide-line border-y border-line">
    {faqs.map((faq) => (
      <details key={faq.id} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-base font-semibold text-ink marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
          {faq.question}
          <ChevronDown className="size-4 shrink-0 text-brand-700 transition-transform group-open:rotate-180" aria-hidden="true" />
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
          <img src={step.imageUrl} alt={step.imageAlt} width="640" height="420" loading="lazy" className="aspect-[3/2] w-full rounded-card border border-line bg-white object-contain object-top" />
        </figure>
        <div className="p-5">
          <span className="text-xs font-extrabold tracking-widest text-brand-700">0{index + 1}</span>
          <h3 className="mt-3 text-base font-bold leading-6 text-ink">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{step.description}</p>
        </div>
      </li>
    ))}
  </ol>
);

const sectionById = (content: StorefrontContent, id: StorefrontContent['sections'][number]['id']) =>
  content.sections.find((section) => section.id === id);

export const HomeEditorial = ({
  content,
  preview = false,
}: {
  content: StorefrontContent;
  preview?: boolean;
}) => {
  const featured = sectionById(content, 'featured');
  const choices = sectionById(content, 'choices');
  const extras = sectionById(content, 'extras');
  const servicesEnabled = choices?.enabled !== false || extras?.enabled !== false;

  return (
    <>
      <HomeHero hero={content.hero} content={content} />
      <HomeCategoryShowcase />

      {featured?.enabled !== false && (
        <HomeFeaturedMenu
          title={featured?.title || 'Los más elegidos'}
          description={featured?.description || 'Descubre las tortas que más eligen nuestros clientes.'}
          productIds={content.featuredProductIds}
        />
      )}

      {servicesEnabled && (
        <HomeServicesSection
          content={content}
          title="Nuestros servicios, a tu medida"
          description="Elige una torta diseñada por ti o añade una experiencia digital para compartirla."
        />
      )}

      <HomePaymentMethods />

      {preview && (
        <span className="sr-only">
          Vista previa del inicio. Las secciones educativas completas permanecen disponibles en la guía de compra.
        </span>
      )}
    </>
  );
};
