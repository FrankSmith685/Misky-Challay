import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectBestBranch, shortlistBranches, type BranchSelectionCandidate } from '../modules/geo/branchSelection';

const candidate = (
  values: Partial<BranchSelectionCandidate> & Pick<BranchSelectionCandidate, 'id'>,
): BranchSelectionCandidate => ({
  id: values.id,
  isOpen: values.isOpen ?? true,
  prepMinutes: values.prepMinutes ?? 15,
  activeOrders: values.activeOrders ?? 0,
  priority: values.priority ?? 1,
  distanceKm: values.distanceKm ?? 1,
});

describe('seleccion de cocina para delivery', () => {
  it('prefiere un local abierto frente a otro cerrado aunque este mas cerca', () => {
    const rows = shortlistBranches([
      candidate({ id: 1, isOpen: false, distanceKm: 0.2 }),
      candidate({ id: 2, isOpen: true, distanceKm: 3 }),
    ]);
    assert.equal(selectBestBranch(rows, new Map(), 30)?.id, 2);
  });

  it('desvia el pedido de una cocina saturada hacia otra disponible', () => {
    const rows = shortlistBranches([
      candidate({ id: 1, activeOrders: 9, distanceKm: 0.5 }),
      candidate({ id: 2, activeOrders: 0, distanceKm: 2 }),
    ]);
    const routes = new Map([
      [1, { minutes: 3, distanceKm: 0.7 }],
      [2, { minutes: 8, distanceKm: 2.4 }],
    ]);
    assert.equal(selectBestBranch(rows, routes, 30)?.id, 2);
  });

  it('usa la prioridad configurada cuando la operacion es comparable', () => {
    const rows = shortlistBranches([
      candidate({ id: 1, priority: 1, distanceKm: 2 }),
      candidate({ id: 2, priority: 2, distanceKm: 1.8 }),
    ]);
    const routes = new Map([
      [1, { minutes: 8, distanceKm: 2 }],
      [2, { minutes: 7, distanceKm: 1.8 }],
    ]);
    assert.equal(selectBestBranch(rows, routes, 30)?.id, 1);
  });

  it('elige el local mas cercano cuando horario, carga y prioridad son iguales', () => {
    const rows = shortlistBranches([
      candidate({ id: 1, distanceKm: 3 }),
      candidate({ id: 2, distanceKm: 1 }),
    ]);
    const routes = new Map([
      [1, { minutes: 12, distanceKm: 3.4 }],
      [2, { minutes: 5, distanceKm: 1.2 }],
    ]);
    assert.equal(selectBestBranch(rows, routes, 30)?.id, 2);
  });

  it('la ruta real puede corregir el orden de la distancia recta', () => {
    const rows = shortlistBranches([
      candidate({ id: 1, distanceKm: 1 }),
      candidate({ id: 2, distanceKm: 1.4 }),
    ]);
    const routes = new Map([
      [1, { minutes: 18, distanceKm: 5 }],
      [2, { minutes: 6, distanceKm: 2 }],
    ]);
    assert.equal(selectBestBranch(rows, routes, 30)?.id, 2);
  });
});
