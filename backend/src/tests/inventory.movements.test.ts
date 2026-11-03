import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { InventoryItem, InventoryMovement, User } from '@database/models';
import { inventoryService } from '../modules/operations/inventory.service';

afterEach(() => mock.restoreAll());

test('el historial muestra el responsable de un ajuste y deja sin responsable las reservas automáticas', async () => {
  const item = InventoryItem.build({ code: 'INS-PRUEBA', name: 'Azúcar', unit: 'kg' });
  const common = {
    branchId: 1, inventoryItemId: 9, quantity: 1, onHandAfter: 3,
    reservedAfter: 0, totalCost: null, reason: null, orderId: null,
    purchaseOrderId: null, lotId: null, createdAt: new Date('2026-01-01T10:00:00Z'),
  };
  const movements = [
    { ...common, id: 1, type: 'ADJUSTMENT', actorId: 7, get: () => item },
    { ...common, id: 2, type: 'RESERVE', actorId: null, get: () => item },
  ] as unknown as InventoryMovement[];
  mock.method(InventoryMovement, 'findAll', async () => movements);
  const findActors = mock.method(User, 'findAll', async () => [{ id: 7, fullName: 'Ana López' }] as User[]);

  const result = await inventoryService.listMovements(1, 9);

  assert.equal(result[0].actorName, 'Ana López');
  assert.equal(result[1].actorName, null);
  assert.equal(findActors.mock.callCount(), 1);
});
