import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'inventory_items', 'allergens', {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  });
  // Las revisiones anteriores eran manuales y no cubrían la nueva fuente por insumo.
  // Mantener los vínculos históricos, pero impedir su publicación hasta recalcular.
  await context.sequelize.query(
    'UPDATE products SET allergens_reviewed_at = NULL WHERE id IN (SELECT product_id FROM cake_product_profiles)',
  );
  await context.sequelize.query(
    'DELETE FROM product_dietary_tags WHERE product_id IN (SELECT product_id FROM cake_product_profiles)',
  );
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'inventory_items', 'allergens');
};
