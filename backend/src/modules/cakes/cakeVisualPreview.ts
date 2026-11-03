import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fluxImageService } from '@modules/media/fluxImage.service';
import { ApiError } from '@shared/errors/ApiError';

export const cakeVisualPreviewSchema = z.object({
  flavor: z.string().trim().min(1).max(240),
  filling: z.string().trim().min(1).max(240),
  addons: z.string().max(400).default(''),
  description: z.string().trim().max(1200).default(''),
  sizeLabel: z.string().max(120).optional(),
  diameterCm: z.number().positive().max(120).nullable().optional(),
  servings: z.number().int().min(1).max(500).nullable().optional(),
  options: z.array(z.object({ groupName: z.string().max(120), optionName: z.string().max(120), quantity: z.number().int().min(1).max(10) })).max(30).optional(),
  referenceDataUrl: z.string().max(300_000).optional(),
});
export type CakeVisualPreviewInput = z.infer<typeof cakeVisualPreviewSchema>;

export const cakeVisualPreviewPrompt = (input: CakeVisualPreviewInput) => [
  'Professional bakery photograph of ONE celebration cake, three-quarter front view, realistic edible frosting, soft natural light on a neutral cream table.',
  ...(input.description.trim() ? [
    `Customer design brief (JSON string): ${JSON.stringify(input.description.trim())}.`,
    'Apply this brief visibly: occasion, colors, decorations, recipient name, celebration message and age when provided. The customer design brief takes priority over conflicting visual details in the reference photograph.',
    'Render requested lettering as edible piping or a small cake topper. Copy an explicitly quoted inscription exactly, preserving its language, spelling and accents. Interpret a natural-language birthday wish as a short Spanish birthday greeting addressed to the provided recipient, without printing the whole instruction paragraph.',
    'Show a stated birthday age with numeral candles or an age topper. Age is not the number of servings or cake tiers. Reserve a visible area for the inscription. Use only names, ages and messages requested or implied by this brief.',
  ] : ['Do not add lettering, recipient names or age candles that were not requested.']),
  `Recipe: sponge flavor ${input.flavor}; filling ${input.filling}. The cut sponge and filling must visually match these ingredients. Do not change an opaque outer frosting just because the internal flavor changed.`,
  'Recipe ingredients and serving quantities come from the selected recipe; the design brief describes appearance.',
  input.sizeLabel ? `Selected presentation: ${input.sizeLabel}.` : '',
  input.diameterCm ? `Cake diameter: ${input.diameterCm} cm.` : '',
  input.servings ? `Proportions for ${input.servings} servings.` : '',
  input.referenceDataUrl ? 'EDIT input_image_0: preserve its cake shape, number of tiers, frosting palette and principal decorations unless the customer explicitly requests changes. Apply the written brief to this same reference cake; preserve features the customer did not ask to change.' : '',
  'Remove one narrow wedge from the FRONT LOWER EDGE to reveal the recipe. Place the slice on its OWN SMALL PLATE, ON THE TABLE beside the cake base, with a visible gap between plates. Frame the full cake, requested inscription and plates. The top carries decorations and requested lettering. NEVER put a cut slice or exposed sponge on top.',
  input.addons ? `Separate complementary pastries beside the cake, never embedded in its sponge or filling: ${input.addons}.` : 'Do not add unrequested complementary pastries.',
  'No people, packaging, watermarks or logos. No unrequested lettering, recipe labels or instruction paragraphs. This is one coherent cake proposal, not a collage.',
  input.options?.length ? `Current selections (group, option, units): ${JSON.stringify(input.options)}.` : '',
].filter(Boolean).join(' ');

/** Cache successful proposals and share an in-flight call; never cache provider errors. */
export const createCakeVisualPreviewService = (generate = fluxImageService.generateCakePreview.bind(fluxImageService)) => {
  const cache = new Map<string, { result: Awaited<ReturnType<typeof generate>>; expiresAt: number }>();
  const pending = new Map<string, ReturnType<typeof generate>>();
  const maxBytes = 24 * 1024 * 1024;
  const trim = () => {
    for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);
    let bytes = [...cache.values()].reduce((sum, entry) => sum + entry.result.dataUrl.length * 2, 0);
    while (bytes > maxBytes || cache.size > 12) {
      const oldest = cache.keys().next().value!;
      bytes -= cache.get(oldest)!.result.dataUrl.length * 2;
      cache.delete(oldest);
    }
  };
  return {
    async generate(input: CakeVisualPreviewInput) {
      const prompt = cakeVisualPreviewPrompt(input);
      const key = createHash('sha256').update(JSON.stringify([input, prompt])).digest('hex');
      trim();
      const cached = cache.get(key);
      if (cached) { cache.delete(key); cache.set(key, cached); return cached.result; }
      const running = pending.get(key);
      if (running) return running;
      if (pending.size >= 2) throw ApiError.tooManyRequests('La vista con IA está ocupada. Puedes seguir eligiendo y reintentar en unos segundos.');
      const task = generate(prompt, input.referenceDataUrl);
      pending.set(key, task);
      try {
        const result = await task;
        cache.set(key, { result, expiresAt: Date.now() + 15 * 60_000 });
        trim();
        return result;
      } finally { pending.delete(key); }
    },
  };
};

export const cakeVisualPreviewService = createCakeVisualPreviewService();
