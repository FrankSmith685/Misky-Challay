import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'cake_design_requests', 'request_kind', {
    type: DataTypes.ENUM('ADVANCED', 'FREEFORM'), allowNull: false, defaultValue: 'ADVANCED',
  });
  await context.changeColumn('cake_design_requests', 'reference_mime', { type: DataTypes.STRING(30), allowNull: true });
  await context.changeColumn('cake_design_requests', 'reference_bytes', { type: DataTypes.BLOB('long'), allowNull: true });
  await addColumnIfMissing(context, 'order_items', 'design_quote_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(context, 'cake_design_quotes', 'allergen_codes_json', { type: DataTypes.JSON, allowNull: true });
};

// Las solicitudes aceptadas forman parte del historial comercial. No se revierten con pérdida de datos.
