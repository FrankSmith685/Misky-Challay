import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCakeSizeGuides } from '../modules/cakes/cakeSizeGuides';

const variants = [
  { id: 1, servingSize: 8, servingUnit: 'porciones' },
  { id: 2, servingSize: 14, servingUnit: 'porciones' },
  { id: 3, servingSize: 26, servingUnit: 'porciones' },
];
const guides = [
  { variantId: 1, diameterCm: 14, minServings: 6, maxServings: 8 },
  { variantId: 2, diameterCm: 18, minServings: 12, maxServings: 14 },
  { variantId: 3, diameterCm: 28, minServings: 24, maxServings: 26 },
];

test('acepta rangos aproximados y porciones adicionales desde 27', () => {
  assert.doesNotThrow(() => validateCakeSizeGuides(guides, variants, 3, true, 27));
});

test('impide anunciar más porciones que el rendimiento registrado', () => {
  assert.throws(() => validateCakeSizeGuides(guides, [{ ...variants[0] }, { ...variants[1], servingSize: 12 }, variants[2]], 3, true, 27), /rendimiento/);
});

test('impide rangos superpuestos o comenzar porciones libres antes de 27', () => {
  assert.throws(() => validateCakeSizeGuides([{ ...guides[0] }, { ...guides[1], minServings: 8 }, guides[2]], variants, 3, true, 27), /superponerse/);
  assert.throws(() => validateCakeSizeGuides(guides, variants, 3, true, 26), /después/);
});
