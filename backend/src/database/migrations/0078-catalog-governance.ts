import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Versiones optimistas para que dos gestores no se sobrescriban en silencio. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['products', 'product_variants', 'categories']) {
    await addColumnIfMissing(q, table, 'version', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
    });
  }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['categories', 'product_variants', 'products'])
    await removeColumnIfPresent(q, table, 'version');
};
