import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { Product, sequelize } from '@database/models';
import { catalogAdminService } from '../modules/admin/catalogAdmin.service';

afterEach(() => mock.restoreAll());

const mockTransaction = () => {
  mock.method(sequelize, 'transaction', async (work: (transaction: Transaction) => Promise<unknown>) =>
    work({ LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction));
};

test('archivar exige estado retirado y usa borrado lógico', async () => {
  mockTransaction();
  let destroyedWithForce: boolean | undefined;
  mock.method(Product, 'findByPk', async () => ({
    id: 25, name: 'Crear tu Torta', status: 'INACTIVE',
    destroy: async (options: { force?: boolean }) => { destroyedWithForce = options.force; },
  }) as Product);

  const archived = await catalogAdminService.archiveProduct(25);
  assert.equal(archived.id, 25);
  assert.equal(destroyedWithForce, undefined);
});

test('un producto activo debe retirarse antes de archivarse', async () => {
  mockTransaction();
  let destroyed = false;
  mock.method(Product, 'findByPk', async () => ({
    id: 25, status: 'ACTIVE', destroy: async () => { destroyed = true; },
  }) as Product);

  await assert.rejects(catalogAdminService.archiveProduct(25), /Retira el producto/);
  assert.equal(destroyed, false);
});

test('restaurar recupera la ficha como retirada sin publicarla', async () => {
  mockTransaction();
  let restored = false;
  mock.method(Product, 'findByPk', async () => ({
    id: 25, name: 'Crear tu Torta', status: 'INACTIVE', deletedAt: new Date(),
    restore: async () => { restored = true; },
  }) as Product);

  const product = await catalogAdminService.restoreProduct(25);
  assert.equal(restored, true);
  assert.equal(product.status, 'INACTIVE');
});

test('un producto existente no puede volver a borrador para borrarse', async () => {
  await assert.rejects(catalogAdminService.changeStatus(25, 'DRAFT'), /no puede volver a borrador/);
});
