import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDesignQuoteScope } from '../modules/cakes/designQuoteScope';

test('la cotización conserva el modelo, el diseño final y las elecciones solicitadas', () => {
  const scope = buildDesignQuoteScope({
    modelName: 'Flores delicadas',
    brief: {
      occasion: 'Cumpleaños', theme: 'Flores delicadas', style: '', colors: [], servings: 8,
      message: 'Feliz cumpleaños', budget: '', notes: '',
      selectedOptions: [{ optionId: 4, group: 'Sabores', option: 'Vainilla', quantity: 1 }],
    },
    specification: {
      flavor: 'Vainilla', filling: 'Fudge casero', finish: 'Flores crema en rosa y blanco sobre una torta redonda',
      inscription: 'Feliz cumpleaños', notes: 'Sin nueces',
    },
    conditions: 'Entrega en la fecha acordada.',
  });
  for (const detail of ['Flores delicadas', 'PORCIONES: 8', 'SABOR DEL BIZCOCHO: Vainilla', 'RELLENO: Fudge casero', 'Flores crema en rosa y blanco', 'Feliz cumpleaños', 'Sin nueces', 'Sabores: Vainilla', 'Entrega en la fecha acordada.']) {
    assert.ok(scope.includes(detail), detail);
  }
});
