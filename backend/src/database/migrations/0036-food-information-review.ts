import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'products', 'allergens_reviewed_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'product_nutrition', 'verified_at', { type: DataTypes.DATE, allowNull: true });

  const allergenOptions = [
    ['gluten', 'Gluten'], ['lacteos', 'Lácteos'], ['huevo', 'Huevo'],
    ['mani', 'Maní'], ['frutos-secos', 'Frutos secos'], ['soya', 'Soya'],
    ['sesamo', 'Sésamo'], ['pescado', 'Pescado'], ['mariscos', 'Mariscos'],
  ];
  const tagOptions = [
    ['vegano', 'Vegano', '#237c52'], ['vegetariano', 'Vegetariano', '#5ab585'],
    ['sin-gluten', 'Sin gluten', '#369a68'],
  ];
  const existingAllergens = await context.sequelize.query<{ code: string }>('SELECT code FROM allergens', { type: QueryTypes.SELECT });
  const existingTags = await context.sequelize.query<{ code: string }>('SELECT code FROM dietary_tags', { type: QueryTypes.SELECT });
  const allergenCodes = new Set(existingAllergens.map((row) => row.code));
  const tagCodes = new Set(existingTags.map((row) => row.code));
  const now = new Date();
  const missingAllergens = allergenOptions.filter(([code]) => !allergenCodes.has(code)).map(([code, name]) => ({ code, name, created_at: now, updated_at: now }));
  const missingTags = tagOptions.filter(([code]) => !tagCodes.has(code)).map(([code, name, color]) => ({ code, name, color, created_at: now, updated_at: now }));
  if (missingAllergens.length) await context.bulkInsert('allergens', missingAllergens);
  if (missingTags.length) await context.bulkInsert('dietary_tags', missingTags);
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'product_nutrition', 'verified_at');
  await removeColumnIfPresent(context, 'products', 'allergens_reviewed_at');
};
