import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewEligibility } from '@modules/engagement/engagement.service';
import { createReviewSchema } from '@modules/engagement/engagement.validation';

test('RN-020 permite reseñar solo una compra entregada del mismo cliente', () => {
  assert.equal(reviewEligibility(7, 7, 'DELIVERED', 10), 'ELIGIBLE');
  assert.equal(reviewEligibility(8, 7, 'DELIVERED', 10), 'NOT_OWNED');
  assert.equal(reviewEligibility(7, 7, 'PREPARING', 10), 'NOT_DELIVERED');
  assert.equal(reviewEligibility(7, 7, 'DELIVERED', null), 'NO_PRODUCT');
});

test('la reseña rechaza estrellas fuera del rango y limita el comentario', () => {
  assert.equal(createReviewSchema.safeParse({ body: { orderItemId: 1, rating: 5, comment: 'Muy bueno' } }).success, true);
  assert.equal(createReviewSchema.safeParse({ body: { orderItemId: 1, rating: 0 } }).success, false);
  assert.equal(createReviewSchema.safeParse({ body: { orderItemId: 1, rating: 6 } }).success, false);
  assert.equal(createReviewSchema.safeParse({ body: { orderItemId: 1, rating: 4, comment: 'x'.repeat(801) } }).success, false);
});
