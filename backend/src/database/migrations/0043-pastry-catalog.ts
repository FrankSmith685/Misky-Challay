import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Amplía el catálogo conservando los productos y pedidos existentes. */
export const up = async ({ context }: MigrationParams<QueryInterface>) => {
  const products = await context.describeTable('products');
  if (!products.family) await context.addColumn('products', 'family', {
    type: DataTypes.ENUM('CAKE', 'DESSERT', 'NOUGAT', 'BITES'), allowNull: false, defaultValue: 'CAKE',
  });
  if (!products.preparation_mode) await context.addColumn('products', 'preparation_mode', {
    type: DataTypes.ENUM('MADE_TO_ORDER', 'READY_STOCK'), allowNull: false, defaultValue: 'MADE_TO_ORDER',
  });
  const inventory = await context.describeTable('inventory_items');
  if (!inventory.item_type) await context.addColumn('inventory_items', 'item_type', {
    type: DataTypes.ENUM('INGREDIENT', 'FINISHED_PRODUCT'), allowNull: false, defaultValue: 'INGREDIENT',
  });
  for (const [name, slug, sortOrder] of [
    ['Tortas', 'tortas', 10], ['Postres', 'postres', 20],
    ['Turrones', 'turrones', 30], ['Bocaditos', 'bocaditos', 40],
  ] as const) {
    const existing = await context.sequelize.query('SELECT id FROM categories WHERE slug = :slug OR name = :name LIMIT 1', {
      replacements: { slug, name }, type: QueryTypes.SELECT,
    });
    if (!existing.length) await context.bulkInsert('categories', [{ name, slug, sort_order: sortOrder, is_active: true, created_at: new Date(), updated_at: new Date() }]);
  }
  const tags = await context.sequelize.query("SELECT id FROM dietary_tags WHERE code = 'sin-azucar' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tags.length) await context.bulkInsert('dietary_tags', [{ code: 'sin-azucar', name: 'Sin azúcar', created_at: new Date(), updated_at: new Date() }]);
};

export const down = async ({ context }: MigrationParams<QueryInterface>) => {
  // Las categorías y etiquetas pueden tener productos asociados: se conservan.
  await context.removeColumn('inventory_items', 'item_type');
  await context.removeColumn('products', 'preparation_mode');
  await context.removeColumn('products', 'family');
};
