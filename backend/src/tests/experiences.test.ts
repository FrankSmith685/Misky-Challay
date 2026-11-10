import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request } from 'express';
import { sequelize, Order, CakeProductProfile, Coupon } from '@database/models';
import {
  ExperienceProject,
  ExperienceEvent,
  ExperienceAsset,
  ExperiencePackage,
} from '@database/models/experience.model';
import {
  sceneSchema,
  packageSchema,
  paymentAllows,
  publicExperienceAvailable,
  validateAsset,
} from '../modules/experiences/experience.logic';
import { experienceService } from '../modules/experiences/experience.service';
import { experiencePricing } from '../modules/experiences/experience.pricing';
import { pricingService } from '../modules/pricing/pricing.service';
import { customizationService } from '../modules/customization/customization.service';
import { plansService } from '../modules/plans/plans.service';
import { walletService } from '../modules/plans/wallet.service';
import { quoteSchema, placeSchema } from '../modules/checkout/checkout.validation';

afterEach(() => mock.restoreAll());
const request = { user: { sub: 8, branchIds: [2], isSuperAdmin: false } } as Request;
const snapshot = {
  id: 1,
  version: 2,
  name: 'Experiencia AR',
  description: 'Servicio digital',
  mode: 'AR' as const,
  price: 30,
  validityDays: 90,
  revisionsIncluded: 1,
  minLeadHours: 48,
  paymentRequirement: 'FULL' as const,
};
function project(values: Record<string, unknown> = {}) {
  const value = {
    id: 4,
    orderId: 12,
    status: 'AWAITING_APPROVAL',
    version: 2,
    approvedVersion: null as number | null,
    sceneJson: sceneSchema.parse({}),
    packageSnapshotJson: snapshot,
    previewExpiresAt: new Date(Date.now() + 86400000),
    revisionsUsed: 0,
    ...values,
  };
  Object.assign(value, { save: async () => value, reload: async () => value });
  return value;
}
function transaction() {
  mock.method(sequelize, 'transaction', async (fn: (tx: unknown) => unknown) =>
    fn({ LOCK: { UPDATE: 'UPDATE' } }),
  );
  mock.method(ExperienceEvent, 'create', async () => ({}));
}
test('las condiciones de pago y vigencia se comprueban también al abrir un QR publicado', () => {
  const now = new Date();
  const p = {
    status: 'PUBLISHED',
    startsAt: new Date(now.getTime() - 1000),
    expiresAt: new Date(now.getTime() + 1000),
  };
  const order = { status: 'CONFIRMED', depositPaidAt: now, balancePaidAt: null };
  assert.equal(paymentAllows(order, 'DEPOSIT'), true);
  assert.equal(paymentAllows(order, 'FULL'), false);
  assert.equal(publicExperienceAvailable(p, { ...order, balancePaidAt: now }, 'FULL', now), true);
  for (const status of ['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'])
    assert.equal(
      publicExperienceAvailable(p, { ...order, status, balancePaidAt: now }, 'FULL', now),
      false,
    );
  for (const status of ['DRAFT', 'PAUSED', 'APPROVED', 'EXPIRED'])
    assert.equal(
      publicExperienceAvailable({ ...p, status }, { ...order, balancePaidAt: now }, 'FULL', now),
      false,
    );
  assert.equal(
    publicExperienceAvailable(
      { ...p, expiresAt: now },
      { ...order, balancePaidAt: now },
      'FULL',
      now,
    ),
    false,
  );
  assert.equal(
    publicExperienceAvailable(
      { ...p, startsAt: new Date(now.getTime() + 1) },
      { ...order, balancePaidAt: now },
      'FULL',
      now,
    ),
    false,
  );
});
test('no ofrece servicios gratuitos inventados y valida límites de escena', () => {
  assert.equal(
    packageSchema.safeParse({ ...snapshot, isActive: false, templateId: null, price: 0 }).success,
    true,
  );
  assert.equal(
    packageSchema.safeParse({ ...snapshot, isActive: true, templateId: null, price: 0 }).success,
    false,
  );
  assert.equal(sceneSchema.safeParse({ scale: 8 }).success, false);
  assert.equal(sceneSchema.safeParse({ color: 'javascript:alert(1)' }).success, false);
  assert.equal(
    sceneSchema.safeParse({
      content: 'CAKE',
      layers: [
        {
          id: 'greeting',
          kind: 'BUTTON',
          name: 'Ver saludo',
          text: 'Reproducir saludo',
          action: 'PLAY_VIDEO',
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    sceneSchema.safeParse({
      layers: [{ id: 'bad id', kind: 'TEXT', name: 'Texto', text: 'Hola' }],
    }).success,
    false,
  );
});
test('el checkout cotiza al elegir el adicional, exige la idea al confirmar y descarta precios del cliente', () => {
  const body = {
    items: [{ productId: 1, variantId: 1, quantity: 1 }],
    deliveryType: 'PICKUP',
    branchId: 1,
    serviceMode: 'SCHEDULED',
    deliverySlotId: 1,
    termsAccepted: true, termsVersion: 1, idempotencyKey: 'qr-checkout-test',
    experience: { packageId: 1, expectedVersion: 2, brief: '', price: 1 },
  };
  const quote = quoteSchema.parse({ body });
  assert.equal(quote.body.experience?.brief, '');
  assert.equal('price' in quote.body.experience!, false);
  assert.equal(placeSchema.safeParse({ body }).success, false);
  assert.equal(
    placeSchema.safeParse({
      body: { ...body, experience: { ...body.experience, brief: 'Una idea para mi cumpleaños' } },
    }).success,
    true,
  );
});
test('el precio comercial se consulta en servidor y detecta cambios de versión', async () => {
  mock.method(ExperiencePackage, 'findByPk', async () => ({ ...snapshot, isActive: true }));
  assert.equal(
    (await experiencePricing.quote({ packageId: 1, expectedVersion: 2, brief: 'Mi celebración' }))
      ?.price,
    30,
  );
  await assert.rejects(
    experiencePricing.quote({ packageId: 1, expectedVersion: 1, brief: 'Mi celebración' }),
    /cambió/,
  );
});
test('la consulta privada por cliente busca simultáneamente pedido y propietario', async () => {
  const lookup = mock.method(Order, 'findOne', async () => null);
  await assert.rejects(experienceService.customer('PEDIDO-AJENO', 42));
  assert.deepEqual(lookup.mock.calls[0].arguments[0]?.where, {
    orderNumber: 'PEDIDO-AJENO',
    userId: 42,
  });
});
test('el estudio respeta el alcance de la sede', async () => {
  mock.method(ExperienceProject, 'findByPk', async () => project());
  mock.method(Order, 'findByPk', async () => ({ branchId: 99 }));
  await assert.rejects(experienceService.load(4, request), /sucursal/);
});
test('la aprobación está ligada a la versión y una propuesta vencida no puede aprobarse', async () => {
  transaction();
  const p = project();
  mock.method(experienceService, 'customer', async () => ({ project: p, order: {} }));
  await assert.rejects(
    experienceService.review('P', 7, { expectedVersion: 1, approve: true, feedback: '' }),
    /cambió/,
  );
  p.previewExpiresAt = new Date(Date.now() - 10);
  await assert.rejects(
    experienceService.review('P', 7, { expectedVersion: 2, approve: true, feedback: '' }),
    /venció/,
  );
  p.previewExpiresAt = new Date(Date.now() + 10000);
  const approved = await experienceService.review('P', 7, {
    expectedVersion: 2,
    approve: true,
    feedback: '',
  });
  assert.equal(approved.approvedVersion, 2);
  assert.equal(approved.status, 'APPROVED');
});
test('pedir cambios consume una revisión y bloquea la versión anterior', async () => {
  transaction();
  const p = project();
  mock.method(experienceService, 'customer', async () => ({ project: p, order: {} }));
  await experienceService.review('P', 7, {
    expectedVersion: 2,
    approve: false,
    feedback: 'Cambiar dedicatoria',
  });
  assert.equal(p.status, 'IN_PROGRESS');
  assert.equal(p.revisionsUsed, 1);
  assert.equal(p.approvedVersion, null);
  p.status = 'AWAITING_APPROVAL';
  p.previewExpiresAt = new Date(Date.now() + 10000);
  await assert.rejects(
    experienceService.review('P', 7, {
      expectedVersion: 2,
      approve: false,
      feedback: 'Otro cambio',
    }),
    /revisiones incluidas/,
  );
});
test('publicar exige pago, versión aprobada y contenido completo', async () => {
  transaction();
  const p = project({ status: 'APPROVED', approvedVersion: 1 });
  const order = { status: 'CONFIRMED', branchId: 2, balancePaidAt: null };
  mock.method(experienceService, 'load', async () => ({ project: p, order }));
  mock.method(experienceService, 'notify', async () => undefined);
  await assert.rejects(
    experienceService.transition(4, request, { expectedVersion: 2, action: 'PUBLISH' }),
    /pago/,
  );
  Object.assign(order, { balancePaidAt: new Date() });
  await assert.rejects(
    experienceService.transition(4, request, { expectedVersion: 2, action: 'PUBLISH' }),
    /video/,
  );
  p.sceneJson.videoAssetId = 7;
  mock.method(ExperienceAsset, 'findAll', async () => [{ id: 7, kind: 'VIDEO', projectId: 4 }]);
  await assert.rejects(
    experienceService.transition(4, request, { expectedVersion: 2, action: 'PUBLISH' }),
    /aprobar/,
  );
  p.approvedVersion = 2;
  const result = await experienceService.transition(4, request, {
    expectedVersion: 2,
    action: 'PUBLISH',
  });
  assert.equal(result.status, 'PUBLISHED');
  assert.deepEqual(result.publishedSceneJson, p.sceneJson);
  assert.equal(
    Math.round((result.expiresAt!.getTime() - result.startsAt!.getTime()) / 86400000),
    90,
  );
});
test('los archivos de reconocimiento deben corresponder a la misma imagen', async () => {
  mock.method(ExperienceAsset, 'findAll', async () => [
    { id: 2, kind: 'IMAGE' },
    { id: 3, kind: 'TARGET', sourceImageId: 99 },
  ]);
  await assert.rejects(
    experienceService.assets(sceneSchema.parse({ targetImageAssetId: 2, targetAssetId: 3 })),
    /correspondiente/,
  );
  await assert.rejects(
    experienceService.assets(sceneSchema.parse({ content: 'VIDEO' }), true),
    /archivos/,
  );
});
test('archivos binarios rechazan MIME falso y modelos con recursos externos', () => {
  assert.throws(() => validateAsset('VIDEO', 'video/mp4', Buffer.from('<script>')));
  assert.throws(() => validateAsset('IMAGE', 'image/png', Buffer.from('not an image')));
  const json = Buffer.from(
    JSON.stringify({ buffers: [{ uri: 'https://externo.test/model.bin' }] }),
  );
  const glb = Buffer.alloc(20 + json.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.write('JSON', 16);
  json.copy(glb, 20);
  assert.throws(() => validateAsset('MODEL', 'model/gltf-binary', glb), /dentro del archivo/);
});
test('no se pueden incorporar archivos privados de otro pedido ni convertirlos en plantilla', async () => {
  mock.method(ExperienceAsset, 'findAll', async () => [{ id: 7, kind: 'VIDEO', projectId: 4 }]);
  const scene = sceneSchema.parse({ videoAssetId: 7 });
  await assert.rejects(experienceService.assets(scene, false, 99), /otro trabajo privado/);
  await assert.rejects(experienceService.assets(scene), /otro trabajo privado/);
  await experienceService.assets(scene, false, 4);
});
test('el adicional suma al total y al IGV, pero no recibe el descuento destinado a productos', async () => {
  mock.method(CakeProductProfile, 'findByPk', async () => ({ isActive: true }));
  mock.method(customizationService, 'quote', async () => ({
    productId: 1,
    variantId: 1,
    unitPrice: 100,
    lineTotal: 100,
    quantity: 1,
    selections: [],
  }));
  mock.method(plansService, 'activeBenefits', async () => []);
  mock.method(walletService, 'getBalance', async () => 0);
  mock.method(experiencePricing, 'quote', async () => snapshot);
  mock.method(Coupon, 'findOne', async () => ({
    id: 2,
    code: 'TEST',
    isActive: true,
    validFrom: null,
    validUntil: null,
    usageLimit: null,
    usedCount: 0,
    minOrderAmount: 0,
    usageLimitPerUser: 100,
    discountType: 'PERCENT',
    value: 10,
    maxDiscountAmount: null,
  }));
  const result = await pricingService.quoteOrder({
    items: [{ productId: 1, variantId: 1, quantity: 1 }],
    branchId: 1,
    deliveryType: 'PICKUP',
    couponCode: 'TEST',
    experience: { packageId: 1, expectedVersion: 2, brief: 'Demostración' },
  });
  assert.equal(result.productSubtotal, 100);
  assert.equal(result.subtotal, 130);
  assert.equal(result.discountTotal, 10);
  assert.equal(result.grandTotal, 120);
  assert.ok(Math.abs(result.taxableBase + result.taxTotal - 120) < 0.01);
});
