import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Publica productos activos que ya tienen su revisión de alérgenos registrada. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.sequelize.query(
    `UPDATE products product
     SET product.allergens_reviewed_at=COALESCE(product.allergens_reviewed_at, NOW()), product.updated_at=NOW()
     WHERE product.status='ACTIVE'
       AND product.deleted_at IS NULL
       AND product.allergens_reviewed_at IS NULL
       AND EXISTS (SELECT 1 FROM product_allergens allergen WHERE allergen.product_id=product.id)`,
  );
};

export const down = async () => {
  // La revisión es un hecho de publicación y no se puede revertir sin borrar
  // una decisión editorial posterior.
};
