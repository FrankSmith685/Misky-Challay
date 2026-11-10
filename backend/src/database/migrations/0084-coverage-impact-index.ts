import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing } from '../migrationHelpers';

/** Acelera el resumen de pedidos por zona del panel de cobertura. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addIndexIfMissing(q, 'orders', ['coverage_zone_id', 'placed_at'], { name: 'idx_orders_coverage_placed' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('orders', 'idx_orders_coverage_placed'); } catch { /* indice inexistente */ }
};
