import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Menús programados, cupos diarios y acceso QR no predecible por mesa. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'dining_tables', 'qr_token', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await addColumnIfMissing(context, 'dining_tables', 'qr_enabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await context.sequelize.query(
    'UPDATE dining_tables SET qr_token = UUID() WHERE qr_token IS NULL OR qr_token = \'\'',
  );
  await context.changeColumn('dining_tables', 'qr_token', {
    type: DataTypes.UUID,
    allowNull: false,
  });
  await addIndexIfMissing(context, 'dining_tables', ['qr_token'], {
    name: 'uq_dining_tables_qr_token',
    unique: true,
  });

  if (!(await tableExists(context, 'dining_offerings'))) await context.createTable('dining_offerings', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    weekdays_json: { type: DataTypes.JSON, allowNull: false },
    starts_at: { type: DataTypes.TIME, allowNull: false },
    ends_at: { type: DataTypes.TIME, allowNull: false },
    daily_limit: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    sold_date: { type: DataTypes.DATEONLY, allowNull: true },
    sold_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'dining_offerings', ['branch_id', 'is_active'], {
    name: 'idx_dining_offerings_branch_active',
  });
  await addIndexIfMissing(context, 'dining_offerings', ['product_id', 'variant_id'], {
    name: 'idx_dining_offerings_product_variant',
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.dropTable('dining_offerings');
  await context.removeIndex('dining_tables', 'uq_dining_tables_qr_token');
  await removeColumnIfPresent(context, 'dining_tables', 'qr_enabled');
  await removeColumnIfPresent(context, 'dining_tables', 'qr_token');
};
