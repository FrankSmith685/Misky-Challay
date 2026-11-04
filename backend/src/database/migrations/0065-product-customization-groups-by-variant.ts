import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const LEGACY_INDEX = 'product_customization_groups_groupId_productId_unique';

/**
 * Los grupos del constructor pueden ser compartidos por varias presentaciones
 * de un mismo producto. El índice antiguo solo incluía product_id y group_id,
 * por lo que al enlazar el mismo grupo a otra variante sustituía el enlace
 * anterior y esa presentación quedaba sin opciones obligatorias.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const indexes = await context.showIndex('product_customization_groups') as unknown as Array<{ name?: string }>;
  if (indexes.some((index) => index.name === LEGACY_INDEX)) {
    await context.removeIndex('product_customization_groups', LEGACY_INDEX);
  }
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const indexes = await context.showIndex('product_customization_groups') as unknown as Array<{ name?: string }>;
  if (!indexes.some((index) => index.name === LEGACY_INDEX)) {
    await context.addIndex('product_customization_groups', ['product_id', 'group_id'], {
      name: LEGACY_INDEX,
      unique: true,
    });
  }
};

