import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import {
  BranchInventory, CakeTheme, CustomizationOption, InventoryItem, InventoryLot,
  InventoryMovement, PurchaseOrderItem, RecipeItem, sequelize,
} from '@database/models';
import { inventoryService } from '../modules/operations/inventory.service';

afterEach(() => mock.restoreAll());

const mockDeletionDependencies = (overrides: { active?: boolean; hasMovement?: boolean; hasQuote?: boolean; otherBranchStock?: number } = {}) => {
  const item = InventoryItem.build({ id: 17, code: 'INS-TEST', name: 'Prueba', unit: 'g', isActive: overrides.active ?? false });
  const stock = BranchInventory.build({ branchId: 3, inventoryItemId: 17, onHand: 0, reserved: 0 });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => Promise<unknown>) => callback(transaction));
  mock.method(InventoryItem, 'findByPk', async () => item);
  const otherBranch = BranchInventory.build({ branchId: 9, inventoryItemId: 17, onHand: overrides.otherBranchStock ?? 0, reserved: 0 });
  const stocks = mock.method(BranchInventory, 'findAll', async () => overrides.otherBranchStock === undefined ? [stock] : [stock, otherBranch]);
  mock.method(InventoryMovement, 'findOne', async () => overrides.hasMovement ? {} : null);
  mock.method(InventoryLot, 'findOne', async () => null);
  mock.method(RecipeItem, 'findOne', async () => null);
  mock.method(CustomizationOption, 'findOne', async () => null);
  mock.method(PurchaseOrderItem, 'findOne', async () => null);
  mock.method(CakeTheme, 'findAll', async () => []);
  const query = mock.method(sequelize, 'query', async () => overrides.hasQuote ? [{ id: 1 }] : []);
  const destroyStock = mock.method(BranchInventory, 'destroy', async () => 1);
  const destroyItem = mock.method(item, 'destroy', async () => item);
  return { stocks, query, destroyStock, destroyItem };
};

test('elimina un insumo archivado sin actividad y quita sus saldos vacíos', async () => {
  const spies = mockDeletionDependencies();
  const result = await inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 });
  assert.deepEqual(result, { id: 17, code: 'INS-TEST', name: 'Prueba' });
  assert.equal(spies.destroyStock.mock.callCount(), 1);
  assert.equal(spies.destroyItem.mock.callCount(), 1);
});

test('conserva un insumo si tuvo movimientos, incluso con stock cero', async () => {
  const spies = mockDeletionDependencies({ hasMovement: true });
  await assert.rejects(
    inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 }),
    (error: unknown) => error instanceof Error && error.message.includes('movimientos'),
  );
  assert.equal(spies.destroyStock.mock.callCount(), 0);
  assert.equal(spies.destroyItem.mock.callCount(), 0);
});

test('conserva un artículo utilizado por un diseño especial aunque tenga stock cero', async () => {
  const spies = mockDeletionDependencies();
  mock.method(CakeTheme, 'findAll', async () => [CakeTheme.build({ productId: 26, name: 'Modelo', slug: 'modelo', theme: 'Flores', description: '', imageUrlsJson: [], saleMode: 'CONFIGURED', minLeadHours: 72, minServings: 1, maxServings: 100, variantRulesJson: [{ variantId: 55, priceDelta: 10, materials: [{ inventoryItemId: 17, quantity: 1 }], effort: { DECORATING: 10 }, excludedOptionIds: [] }] })]);
  await assert.rejects(() => inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 }), /diseño/);
  assert.equal(spies.destroyItem.mock.callCount(), 0);
});

test('no borra el insumo global si otra cocina aún tiene stock', async () => {
  const spies = mockDeletionDependencies({ otherBranchStock: 2 });
  await assert.rejects(
    inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 }),
    (error: unknown) => error instanceof Error && error.message.includes('stock físico'),
  );
  assert.equal(spies.destroyStock.mock.callCount(), 0);
  assert.equal(spies.destroyItem.mock.callCount(), 0);
});

test('protege presupuestos de tortas y exige que el insumo esté archivado', async () => {
  const spies = mockDeletionDependencies({ hasQuote: true });
  await assert.rejects(
    inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 }),
    (error: unknown) => error instanceof Error && error.message.includes('presupuesto'),
  );
  assert.equal(spies.destroyItem.mock.callCount(), 0);
  mock.restoreAll();

  const activeSpies = mockDeletionDependencies({ active: true });
  await assert.rejects(
    inventoryService.deleteArchivedItem({ branchId: 3, inventoryItemId: 17 }),
    (error: unknown) => error instanceof Error && error.message.includes('Archiva'),
  );
  assert.equal(activeSpies.stocks.mock.callCount(), 0);
  assert.equal(activeSpies.destroyItem.mock.callCount(), 0);
});
