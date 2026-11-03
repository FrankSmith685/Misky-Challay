import { ROUTES } from '@constants/routes';
import type { StorefrontContent } from './storefront.schema';

const publicPaths = new Set<string>([
  ROUTES.home,
  ROUTES.howToOrder,
  ROUTES.menu,
  ROUTES.customCake,
  ROUTES.business,
  ROUTES.plans,
  ROUTES.coverage,
  ROUTES.cakeAr,
  ROUTES.privacy,
  ROUTES.terms,
  ROUTES.cookies,
]);
export const applyStorefrontSeo = (
  pathname: string,
  content: StorefrontContent,
  fallbackTitle: string,
) => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const isHome = path === ROUTES.home;
  const isGuide = path === ROUTES.howToOrder;
  const isProduct = /^\/(menu|tortas)\/[^/]+$/.test(path);
  const indexable = publicPaths.has(path) || isProduct;
  const origin = new URL(import.meta.env.VITE_PUBLIC_WEB_URL || window.location.origin).origin;
  const absolute = (value: string) => new URL(value, origin).href;
  const title = isHome ? content.seo.homeTitle : isGuide ? content.seo.guideTitle : fallbackTitle;
  const description = isGuide
    ? content.seo.guideDescription
    : isHome
      ? content.seo.homeDescription
      : 'Explora las tortas, postres y servicios de Misky Challay. Consulta opciones y fechas disponibles para tu pedido.';
  const meta = (attribute: 'name' | 'property', key: string, value: string) => {
    let node = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.append(node);
    }
    node.content = value;
  };
  document.title = title;
  meta('name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow');
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (indexable) {
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = absolute(path);
  } else canonical?.remove();
  // Product pages replace their own descriptive metadata when their API resolves.
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', absolute(path));
  meta('property', 'og:type', 'website');
  meta('property', 'og:image', absolute(content.seo.socialImageUrl));
  meta('property', 'og:image:alt', 'Misky Challay: tortas y celebraciones');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  meta('name', 'twitter:image', absolute(content.seo.socialImageUrl));
  document.getElementById('storefront-structured-data')?.remove();
  if (isHome || isGuide) {
    const schema = isHome
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Misky Challay',
          url: absolute('/'),
          inLanguage: 'es-PE',
          description,
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: content.guide.title,
          url: absolute(path),
          inLanguage: 'es-PE',
          description,
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Inicio', item: absolute('/') },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Cómo hacer tu pedido',
                item: absolute(path),
              },
            ],
          },
        };
    const node = document.createElement('script');
    node.type = 'application/ld+json';
    node.id = 'storefront-structured-data';
    node.textContent = JSON.stringify(schema);
    document.head.append(node);
  }
};
