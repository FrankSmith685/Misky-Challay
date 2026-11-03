import { Router } from 'express';
import { env } from '@config/env';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { catalogService } from '@modules/catalog/catalog.service';

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
const PUBLIC_PATHS = [
  '/',
  '/como-hacer-tu-pedido',
  '/menu',
  '/crea-tu-torta',
  '/empresas',
  '/planes',
  '/cobertura',
  '/experiencia-ar',
];
export const buildStorefrontSitemap = (
  origin: string,
  products: Array<{ slug: string; family: string }>,
) => {
  const paths = [
    ...PUBLIC_PATHS,
    ...products.map(
      (product) =>
        `/${product.family === 'CAKE' ? 'tortas' : 'menu'}/${encodeURIComponent(product.slug)}`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)].map((path) => `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`).join('\n')}\n</urlset>`;
};
export const storefrontSeoRouter = Router();
storefrontSeoRouter.get('/robots.txt', (_req, res) => {
  const origin = new URL(env.FRONTEND_URL).origin;
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=300')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /cuenta',
        'Disallow: /checkout',
        'Disallow: /carrito',
        'Disallow: /ingresar',
        'Disallow: /crear-cuenta',
        'Disallow: /api/',
        'Disallow: /recuperar-clave',
        'Disallow: /restablecer-clave',
        'Disallow: /vista-3d/',
        'Disallow: /mesa/',
        'Disallow: /experiencias/',
        'Disallow: /experience-camera.html',
        'Disallow: /ar-camera.html',
        `Sitemap: ${origin}/sitemap.xml`,
        '',
      ].join('\n'),
    );
});
storefrontSeoRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const products = await catalogService.listProducts({});
    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=300')
      .send(buildStorefrontSitemap(new URL(env.FRONTEND_URL).origin, products));
  }),
);
