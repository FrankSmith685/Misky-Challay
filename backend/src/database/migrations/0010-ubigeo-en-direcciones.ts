import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Conserva la ubicación administrativa aunque aún no exista un distrito operativo asociado. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const table = await context.describeTable('addresses');

  if (!table.ubigeo_code) {
    await context.addColumn('addresses', 'ubigeo_code', {
      type: DataTypes.STRING(6),
      allowNull: true,
    });
    await context.addIndex('addresses', ['ubigeo_code'], { name: 'addresses_ubigeo_code' });
  }
  if (!table.department_name) {
    await context.addColumn('addresses', 'department_name', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
  }
  if (!table.province_name) {
    await context.addColumn('addresses', 'province_name', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
  }
  if (!table.district_name) {
    await context.addColumn('addresses', 'district_name', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
  }
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const table = await context.describeTable('addresses');
  if (table.ubigeo_code) {
    await context.removeIndex('addresses', 'addresses_ubigeo_code').catch(() => undefined);
  }
  if (table.district_name) await context.removeColumn('addresses', 'district_name');
  if (table.province_name) await context.removeColumn('addresses', 'province_name');
  if (table.department_name) await context.removeColumn('addresses', 'department_name');
  if (table.ubigeo_code) await context.removeColumn('addresses', 'ubigeo_code');
};
