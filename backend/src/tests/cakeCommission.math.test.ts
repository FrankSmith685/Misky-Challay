import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accruedCakeBase, cakeCommissionAmount, cakeLineBase, cakeRefundShare } from '../modules/cakes/cakeCommission.math';

test('el 15 % corresponde solo a tortas descontadas y excluye otros productos y delivery', () => {
  const cakeBase = cakeLineBase([
    { productId: 11, lineTotal: 200, discountTotal: 20 },
    { productId: 22, lineTotal: 80, discountTotal: 8 },
  ], new Set([11]));
  assert.equal(cakeBase, 180);
  assert.equal(cakeCommissionAmount(cakeBase, 0, 0, 0.15), 27);
  assert.equal(cakeRefundShare(cakeBase, 272), 180 / 272); // S/20 de delivery, fuera de la base.
});

test('el anticipo devenga la mitad y el saldo completa la comision', () => {
  assert.equal(accruedCakeBase(180, 136, 272), 90);
  assert.equal(cakeCommissionAmount(90, 0, 0, 0.15), 13.5);
  assert.equal(accruedCakeBase(180, 272, 272), 180);
  assert.equal(accruedCakeBase(180, 300, 272), 180);
});

test('un pedido antiguo reparte el descuento global faltante entre tortas y otros productos', () => {
  assert.equal(cakeLineBase([
    { productId: 11, lineTotal: 200, discountTotal: 0 },
    { productId: 22, lineTotal: 100, discountTotal: 0 },
  ], new Set([11]), 30), 180);
  // Si las líneas ya contienen el descuento, el pedido no vuelve a restarlo.
  assert.equal(cakeLineBase([
    { productId: 11, lineTotal: 200, discountTotal: 20 },
    { productId: 22, lineTotal: 100, discountTotal: 10 },
  ], new Set([11]), 30), 180);
});

test('reembolso parcial reduce la base de tortas proporcionalmente sin crear comision negativa', () => {
  const share = cakeRefundShare(180, 272);
  const cakeRefund = Math.round(68 * share * 100) / 100;
  assert.equal(cakeRefund, 45);
  assert.equal(cakeCommissionAmount(180, 0, cakeRefund, 0.15), 20.25);
  assert.equal(cakeCommissionAmount(180, -500, cakeRefund, 0.15), 0);
});
