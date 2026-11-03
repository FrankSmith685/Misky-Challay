import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '@shared/errors/ApiError';
import { cakeVisualPreviewPrompt, cakeVisualPreviewSchema, createCakeVisualPreviewService } from '../modules/cakes/cakeVisualPreview';

const recipe = { flavor: 'Chocolate', filling: 'Manjar', addons: '2 alfajores', description: 'Flores pequeñas', diameterCm: 18, servings: 14 };
const image = { dataUrl: 'data:image/png;base64,dGVzdA==', mimeType: 'image/png' as const };

test('la propuesta exige sabores válidos y acota tamaño, opciones y referencias', () => {
  assert.equal(cakeVisualPreviewSchema.safeParse({ ...recipe, flavor: '' }).success, false);
  assert.equal(cakeVisualPreviewSchema.safeParse({ ...recipe, filling: '' }).success, false);
  assert.equal(cakeVisualPreviewSchema.safeParse({ ...recipe, servings: 501 }).success, false);
  assert.equal(cakeVisualPreviewSchema.safeParse({ ...recipe, options: [{ groupName: 'Sabor', optionName: 'Chocolate', quantity: 11 }] }).success, false);
  assert.equal(cakeVisualPreviewSchema.safeParse({ ...recipe, referenceDataUrl: 'x'.repeat(300001) }).success, false);
});

test('la receta y la referencia guían la imagen sin convertir complementos en relleno', () => {
  const prompt = cakeVisualPreviewPrompt({ ...recipe, referenceDataUrl: 'reference', options: [{ groupName: 'Decoración', optionName: 'Flores', quantity: 2 }] });
  assert.match(prompt, /sponge flavor Chocolate; filling Manjar/);
  assert.match(prompt, /diameter: 18 cm/);
  assert.match(prompt, /14 servings/);
  assert.match(prompt, /Flores.*quantity.*2/);
  assert.match(prompt, /preserve its cake shape, number of tiers, frosting palette/);
  assert.match(prompt, /Separate complementary pastries/);
  assert.match(prompt, /Do not change an opaque outer frosting/);
  assert.match(prompt, /OWN SMALL PLATE, ON THE TABLE/);
  assert.match(prompt, /NEVER put a cut slice/);
});

test('una receta simultánea comparte llamada y reutiliza su imagen terminada', async () => {
  let calls = 0;
  let finish!: (value: typeof image) => void;
  const service = createCakeVisualPreviewService(async () => { calls++; return new Promise<typeof image>((resolve) => { finish = resolve; }); });
  const first = service.generate(recipe), second = service.generate(recipe);
  assert.equal(calls, 1);
  finish(image);
  assert.deepEqual(await first, image);
  assert.deepEqual(await second, image);
  assert.deepEqual(await service.generate(recipe), image);
  assert.equal(calls, 1);
});

test('personaliza el cumpleaños con nombre y edad incluso si la foto no tiene letras', () => {
  const description = 'Feliz cumpleaños para Pepe, tiene 15 años';
  const prompt = cakeVisualPreviewPrompt({ ...recipe, description, referenceDataUrl: 'reference' });
  assert.ok(prompt.includes(JSON.stringify(description)));
  assert.match(prompt, /brief takes priority over conflicting visual details/);
  assert.match(prompt, /short Spanish birthday greeting addressed to the provided recipient/);
  assert.match(prompt, /birthday age with numeral candles or an age topper/);
  assert.match(prompt, /Age is not the number of servings or cake tiers/);
  assert.match(prompt, /unless the customer explicitly requests changes/);
  assert.doesNotMatch(prompt, /Do not invent readable lettering|ONLY the original decorations/);
  assert.ok(prompt.indexOf(description) < prompt.indexOf('Recipe:'), 'La descripción debe llegar antes de la receta y los detalles secundarios');
});

test('conserva la frase exacta y sus acentos, sin sustituirla por otro saludo', () => {
  const description = 'Escribir «Feliz cumpleaños, Lucía». Número 18 en dorado y flores lilas.';
  const prompt = cakeVisualPreviewPrompt({ ...recipe, description, options: [{ groupName: 'Relleno', optionName: 'Manjar', quantity: 1 }] });
  assert.ok(prompt.includes(JSON.stringify(description)));
  assert.match(prompt, /Copy an explicitly quoted inscription exactly/);
  assert.match(prompt, /preserving its language, spelling and accents/);
  assert.ok(prompt.indexOf(description) < prompt.indexOf('Current selections'));
  assert.doesNotMatch(prompt, /Pepe|15 años/);
});

test('una descripción vacía no inventa nombres, mensajes ni velas de edad', () => {
  const input = cakeVisualPreviewSchema.parse({ ...recipe, description: '   ' });
  assert.equal(input.description, '');
  const prompt = cakeVisualPreviewPrompt(input);
  assert.match(prompt, /Do not add lettering, recipient names or age candles/);
  assert.doesNotMatch(prompt, /Customer design brief|short Spanish birthday greeting/);
});

test('cambiar solamente la descripción genera otra propuesta y conserva la caché de cada diseño', async () => {
  const calls: string[] = [];
  const service = createCakeVisualPreviewService(async (prompt) => { calls.push(prompt); return image; });
  const first = { ...recipe, description: 'Feliz cumpleaños para Pepe, tiene 15 años' };
  const second = { ...first, description: 'Feliz cumpleaños para Ana, tiene 18 años' };
  await service.generate(first);
  await service.generate(second);
  await service.generate(first);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /Pepe, tiene 15 años/);
  assert.match(calls[1], /Ana, tiene 18 años/);
  assert.doesNotMatch(calls[1], /Pepe/);
});

test('cambiar relleno, tamaño o foto requiere una propuesta diferente', async () => {
  const calls: Array<{ prompt: string; reference?: string }> = [];
  const service = createCakeVisualPreviewService(async (prompt, reference) => { calls.push({ prompt, reference }); return image; });
  await service.generate(recipe);
  await service.generate({ ...recipe, filling: 'Fresa' });
  await service.generate({ ...recipe, diameterCm: 28 });
  await service.generate({ ...recipe, referenceDataUrl: 'photo-a' });
  await service.generate({ ...recipe, referenceDataUrl: 'photo-b' });
  assert.equal(calls.length, 5);
  assert.match(calls[1].prompt, /filling Fresa/);
  assert.equal(calls[4].reference, 'photo-b');
});

test('un fallo del proveedor no se guarda como imagen ni bloquea el reintento', async () => {
  let calls = 0;
  const service = createCakeVisualPreviewService(async () => { if (++calls === 1) throw new Error('temporary'); return image; });
  await assert.rejects(service.generate(recipe), /temporary/);
  assert.deepEqual(await service.generate(recipe), image);
  assert.equal(calls, 2);
});

test('limita llamadas simultáneas y libera capacidad al terminar', async () => {
  const finishes: Array<(value: typeof image) => void> = [];
  const service = createCakeVisualPreviewService(async () => new Promise<typeof image>((resolve) => { finishes.push(resolve); }));
  const first = service.generate(recipe), second = service.generate({ ...recipe, filling: 'Fresa' });
  await assert.rejects(service.generate({ ...recipe, filling: 'Café' }), (error: unknown) => error instanceof ApiError && error.statusCode === 429);
  finishes[0](image); finishes[1](image); await Promise.all([first, second]);
  const third = service.generate({ ...recipe, filling: 'Café' }); finishes[2](image);
  assert.deepEqual(await third, image);
});
