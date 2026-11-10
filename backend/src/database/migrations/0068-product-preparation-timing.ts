import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const immediateKekeSlugs = ['keke-de-platano-crumble', 'keke-de-zanahoria', 'keke-de-naranja-glaseada'];

/**
 * Alinea el catalogo existente con la regla de entrega por producto. Estos
 * kekes se ofrecen como producto preparado; siguen dependiendo de stock
 * terminado por sucursal, por lo que no se venden si el taller no los tiene.
 */
export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.sequelize.transaction(async (transaction) => {
    await q.sequelize.query(
      `UPDATE products SET preparation_mode='READY_STOCK', updated_at=NOW()
       WHERE slug IN (:slugs) AND deleted_at IS NULL`,
      { replacements: { slugs: immediateKekeSlugs }, transaction },
    );
    await q.sequelize.query(
      `UPDATE cake_product_profiles profile
       INNER JOIN products product ON product.id=profile.product_id
       SET profile.min_lead_hours=0, profile.updated_at=NOW()
       WHERE product.preparation_mode='READY_STOCK' AND profile.is_active=1`,
      { transaction },
    );
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.sequelize.transaction(async (transaction) => {
    await q.sequelize.query(
      `UPDATE products SET preparation_mode='MADE_TO_ORDER', updated_at=NOW()
       WHERE slug IN (:slugs) AND deleted_at IS NULL`,
      { replacements: { slugs: immediateKekeSlugs }, transaction },
    );
    await q.sequelize.query(
      `UPDATE cake_product_profiles profile
       INNER JOIN products product ON product.id=profile.product_id
       SET profile.min_lead_hours=24, profile.updated_at=NOW()
       WHERE product.slug IN (:slugs) AND profile.is_active=1`,
      { replacements: { slugs: immediateKekeSlugs }, transaction },
    );
  });
};
