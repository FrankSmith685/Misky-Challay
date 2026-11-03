import { z } from 'zod';
import defaults from './storefront.defaults.json';

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
// Only managed image paths or HTTPS; no script/data URLs, traversal or credentials.
export const storefrontImage = text(700).refine((value) => {
  if (/^\/(?:images|brand|api\/v1\/media\/files)\/[a-zA-Z0-9_./-]+$/.test(value)) {
    return !value.split('/').includes('..');
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Selecciona una imagen de la biblioteca o una URL HTTPS');

const card = z.object({ title: text(100), description: text(700) }).strict();
const imageCard = card.extend({ imageUrl: storefrontImage, imageAlt: text(180) });
const choice = card.extend({ label: text(60) });
const sectionId = z.enum(['abc', 'walkthrough', 'choices', 'featured', 'extras', 'faq', 'contact']);
export const storefrontSchema = z
  .object({
    hero: z
      .object({
        eyebrow: text(70),
        title: text(130),
        description: text(500),
        primaryLabel: text(60),
        secondaryLabel: text(60),
        imageUrl: storefrontImage,
        imageAlt: text(180),
      })
      .strict(),
    sections: z
      .array(
        z
          .object({ id: sectionId, enabled: z.boolean(), title: text(120), description: text(500) })
          .strict(),
      )
      .length(7)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === 7,
        'Cada sección debe aparecer una sola vez',
      ),
    abc: z.array(card).length(3),
    walkthrough: z.array(imageCard).length(4),
    choices: z.array(choice).length(3),
    extras: z.array(choice).length(2),
    faqs: z
      .array(
        z
          .object({ id: text(60).regex(/^[a-z0-9-]+$/), question: text(180), answer: text(1400) })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
        'Las preguntas deben tener identificadores únicos',
      ),
    guide: z
      .object({
        title: text(130),
        description: text(500),
        videoUrl: z.union([
          z.literal(''),
          z
            .string()
            .url()
            .max(700)
            .refine((value) => {
              const url = new URL(value);
              return url.protocol === 'https:' && !url.username && !url.password;
            }, 'Usa un enlace HTTPS al video'),
        ]),
        steps: z
          .array(
            card.extend({
              action: z.enum(['catalog', 'custom', 'cart', 'coverage', 'orders']),
              label: text(60),
            }),
          )
          .length(6),
      })
      .strict(),
    seo: z
      .object({
        homeTitle: text(80),
        homeDescription: text(180, 50),
        guideTitle: text(80),
        guideDescription: text(180, 50),
        socialImageUrl: storefrontImage,
      })
      .strict(),
  })
  .strict();

export type StorefrontContent = z.infer<typeof storefrontSchema>;
export const defaultStorefront = (): StorefrontContent =>
  storefrontSchema.parse(structuredClone(defaults));
export const storefrontUpdateSchema = z.object({
  body: z.object({ version: z.number().int().min(0), content: storefrontSchema }).strict(),
});
