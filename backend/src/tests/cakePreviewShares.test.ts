import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import { CakePreviewShare, CakeProductProfile, CakeTheme, CustomizationGroup, CustomizationOption, Product, ProductCustomizationGroup, ProductVariant } from '../database/models';
import type { CakePreviewSnapshot } from '../database/models/cakePreviewShare.model';
import previewRoutes from '../modules/cakes/cakePreviewShare.routes';
import { errorHandler } from '../middlewares/error.middleware';
import type { CakeVisualDesign } from '../modules/cakes/cakeVisualDesign';
import { cakeReconstructionService, referenceHash } from '../modules/cakes/cakeReconstruction.service';

const visualDesign: CakeVisualDesign = { version: 1, icingColor: '#ac99c6', image: { visible: true, placement: 'topper', scale: .8, rotation: 30, offsetX: -.2, offsetY: .3 } };
const reference = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJX0AAAAASUVORK5CYII=';

let server: Server;
let origin: string;
let saved: { token: string; snapshotJson: CakePreviewSnapshot; expiresAt: Date } | null;
let profile: CakeProductProfile;
let theme: CakeTheme | null;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/cake-previews', previewRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}/cake-previews`;
});
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  mock.method(cakeReconstructionService, 'retain', async () => undefined);
  saved = null;
  theme = null;
  profile = CakeProductProfile.build({ productId: 1, saleMode: 'SEMI_CUSTOM', isActive: true, minLeadHours: 48, baseEffortJson: {}, stationOffsetsJson: {},
    customServingsJson: { enabled: false, baseVariantId: null, minServings: 21, maxServings: 60, pricePerExtraServing: 0, sizeGuides: [{ variantId: 2, diameterCm: 22, minServings: 10, maxServings: 15 }] },
  });
  mock.method(Product, 'findByPk', async () => Product.build({ id: 1, categoryId: 1, family: 'CAKE', status: 'ACTIVE', name: 'Torta configurable', slug: 'torta-configurable' }));
  mock.method(CakeProductProfile, 'findByPk', async () => profile);
  mock.method(ProductVariant, 'findOne', async () => ProductVariant.build({ id: 2, productId: 1, name: '12 porciones', sku: 'T-12', basePrice: 120, servingSize: 12, isActive: true }));
  mock.method(CakeTheme, 'findByPk', async () => theme);
  mock.method(ProductCustomizationGroup, 'findAll', async () => [ProductCustomizationGroup.build({ productId: 1, groupId: 3, variantId: 2 })]);
  mock.method(CustomizationGroup, 'findAll', async () => [CustomizationGroup.build({ id: 3, code: 'FLAVOR', name: 'Bizcocho' })]);
  mock.method(CustomizationOption, 'findAll', async () => [CustomizationOption.build({ id: 4, groupId: 3, name: 'Vainilla', maxPerItem: 1 })]);
  mock.method(CakePreviewShare, 'destroy', async () => 0);
  mock.method(CakePreviewShare, 'create', async (value: { token: string; snapshotJson: CakePreviewSnapshot; expiresAt: Date }) => { saved = structuredClone(value); return CakePreviewShare.build(value); });
  mock.method(CakePreviewShare, 'findByPk', async () => saved ? CakePreviewShare.build(saved) : null);
});
afterEach(() => mock.restoreAll());

const post = (body: Record<string, unknown>) => fetch(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: 1, variantId: 2, selections: [{ optionId: 4, quantity: 1 }], ...body }) });

test('el QR oculta también la reconstrucción derivada de una foto privada', async () => {
  const reconstruction = { token: 'm'.repeat(32), sourceHash: referenceHash(reference) };
  const design = { ...visualDesign, referenceMode: 'reconstruct', reconstruction };
  assert.equal((await post({ visualDesign: design, referenceImageDataUrl: reference })).status, 201);
  assert(!saved?.snapshotJson.visualDesign?.reconstruction);
  assert(!JSON.stringify(saved).includes(reconstruction.token));
  assert.equal((await post({ visualDesign: design, includeReferenceImage: true, referenceImageDataUrl: reference })).status, 201);
  assert.deepEqual(saved?.snapshotJson.visualDesign?.reconstruction, reconstruction);
  assert.equal((await post({ visualDesign: { ...design, reconstruction: { ...reconstruction, sourceHash: '0'.repeat(64) } }, includeReferenceImage: true, referenceImageDataUrl: reference })).status, 422);
  assert.equal((await post({ visualDesign: { ...design, referenceMode: 'print', reconstruction: { ...reconstruction, sourceHash: '0'.repeat(64) } }, includeReferenceImage: true, referenceImageDataUrl: reference })).status, 201);
  assert(!saved?.snapshotJson.visualDesign?.reconstruction);
});

test('el QR permite retomar opciones del catálogo sin publicar notas ni precios', async () => {
  const response = await post({ description: 'NOTA PRIVADA', referenceDataUrl: 'FOTO PRIVADA', price: 1 });
  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { token: string } };
  const result = await fetch(`${origin}/${payload.data.token}`);
  const body = await result.json() as { data: { snapshot: CakePreviewSnapshot } };
  assert.equal(result.status, 200);
  assert.deepEqual(body.data.snapshot.configuration?.selections, [{ optionId: 4, quantity: 1 }]);
  assert.equal(body.data.snapshot.diameterCm, 22);
  assert.equal(body.data.snapshot.options[0].optionName, 'Vainilla');
  assert(!JSON.stringify(body).includes('PRIVADA'));
  assert(!('price' in body.data.snapshot));
});

test('los sabores escritos y los diseños a medida no se anuncian como compra configurable', async () => {
  for (const source of ['DESIGN', 'FREEFORM', 'CONFIGURATOR']) {
    const response = await post({ source, visualFlavor: 'Chocolate', visualFilling: 'Fresa' });
    assert.equal(response.status, 201);
    assert.equal(saved?.snapshotJson.configuration, undefined);
    assert(saved?.snapshotJson.options.some((option) => option.optionName === 'Chocolate'));
  }
});

test('rechaza una opción ajena al catálogo antes de guardar el enlace', async () => {
  const response = await post({ selections: [{ optionId: 99, quantity: 1 }] });
  assert.equal(response.status, 422);
  assert.equal(saved, null);
});

test('una medida libre no se publica con el diámetro de la presentación base', async () => {
  const response = await post({ requestedServings: 40 });
  assert.equal(response.status, 201);
  assert.equal(saved?.snapshotJson.diameterCm, null);
  assert.equal(saved?.snapshotJson.configuration?.requestedServings, 40);
});

test('los enlaces vencidos no se recuperan', async () => {
  await post({});
  assert(saved);
  saved.expiresAt = new Date(Date.now() - 1000);
  const response = await fetch(`${origin}/${saved.token}`);
  assert.equal(response.status, 404);
});

test('guarda los ajustes editables y publica la imagen solo con inclusión explícita', async () => {
  await post({ visualDesign, referenceImageDataUrl: reference });
  assert.deepEqual(saved?.snapshotJson.visualDesign, visualDesign);
  assert.equal(saved?.snapshotJson.referenceImageDataUrl, undefined);
  const response = await post({ visualDesign, includeReferenceImage: true, referenceImageDataUrl: reference });
  assert.equal(response.status, 201);
  assert.equal(saved?.snapshotJson.referenceImageDataUrl, reference);
});

test('rechaza ajustes fuera de rango e imágenes que no son archivos admitidos', async () => {
  const invalidDesign = await post({ visualDesign: { ...visualDesign, image: { ...visualDesign.image, scale: 10 } } });
  assert.equal(invalidDesign.status, 400);
  assert.equal(saved, null);
  const invalidImage = await post({ includeReferenceImage: true, referenceImageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.equal(invalidImage.status, 400);
  assert.equal(saved, null);
});

test('editar un enlace crea otra versión y permite retirar la imagen de la copia', async () => {
  await post({ visualDesign, includeReferenceImage: true, referenceImageDataUrl: reference });
  assert(saved);
  const original = saved;
  const before = structuredClone(original.snapshotJson);
  const response = await fetch(`${origin}/${original.token}/copy`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visualDesign: { ...visualDesign, icingColor: '#e6a1b4' }, includeReferenceImage: false }),
  });
  assert.equal(response.status, 201);
  assert(saved);
  assert.notEqual(saved.token, original.token);
  assert.equal(saved.snapshotJson.visualDesign?.icingColor, '#e6a1b4');
  assert.equal(saved.snapshotJson.referenceImageDataUrl, undefined);
  assert.deepEqual(saved.snapshotJson.configuration, original.snapshotJson.configuration);
  assert.deepEqual(original.snapshotJson, before);
});

test('un enlace vencido tampoco permite crear una versión editada', async () => {
  await post({});
  assert(saved);
  saved.expiresAt = new Date(Date.now() - 1000);
  const response = await fetch(`${origin}/${saved.token}/copy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visualDesign }) });
  assert.equal(response.status, 404);
});
