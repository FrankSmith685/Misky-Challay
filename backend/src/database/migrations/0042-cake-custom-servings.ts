import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'cake_product_profiles', 'custom_servings_json', {
    type: DataTypes.JSON, allowNull: false,
    defaultValue: { enabled: false, baseVariantId: null, minServings: 21, maxServings: 60, pricePerExtraServing: 0 },
  });
  await addColumnIfMissing(context, 'customization_options', 'cake_scale_with_servings', {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true,
  });
  await addColumnIfMissing(context, 'order_items', 'requested_servings', {
    type: DataTypes.INTEGER.UNSIGNED, allowNull: true,
  });
  await addColumnIfMissing(context, 'order_item_customizations', 'cake_scale_with_servings', {
    type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true,
  });
};
