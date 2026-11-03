import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Category } from '@database/models';
import { cakeCategoryService } from '../modules/cakes/cakeCategory.service';

afterEach(() => mock.restoreAll());

test('acepta una categoría activa de tortas aunque su slug no sea tortas', async () => {
  const selected = { id: 27, name: 'Tortas Temporadas', slug: 'tortas-temporadas', isActive: true } as Category;
  mock.method(Category, 'findOne', async (options: { where: { id: number; isActive: boolean } }) => {
    assert.deepEqual(options.where, { id: 27, isActive: true });
    return selected;
  });

  assert.equal(await cakeCategoryService.requireActive(27), selected);
});

test('rechaza una categoría que dejó de estar activa', async () => {
  mock.method(Category, 'findOne', async () => null);

  await assert.rejects(cakeCategoryService.requireActive(27), /categoría seleccionada ya no está disponible/);
});
