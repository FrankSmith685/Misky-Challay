import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrderItemSnapshot } from '@modules/checkout/orderItemSnapshot';

test('el snapshot conserva una personalización extensa sin usarla como nombre de variante', () => {
  const description = [
    'Regular',
    'Base: Arroz blanco',
    'Proteína: Pollo grillado, Langostinos',
    'Salsa: Ponzu, Hummus',
    'Toppings: Palta, Edamame, Mango, Pepino, Choclo, Algas wakame, Camote al horno, Kale',
    'Crunch y extras: Ajonjolí tostado, Furikake',
  ].join(' · ');

  assert.ok(description.length > 120);
  assert.deepEqual(buildOrderItemSnapshot({ variantName: 'Regular', description }), {
    variantNameSnapshot: 'Regular',
    descriptionSnapshot: description,
  });
});
