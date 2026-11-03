import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Corrige dos etiquetas heredadas del generador de opciones de demostración. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.sequelize.query(`
    UPDATE customization_options co
    JOIN inventory_items i ON i.id = co.inventory_item_id
    JOIN customization_groups g ON g.id = co.group_id
    SET co.allergens = JSON_ARRAY('frutos-secos', 'lacteos', 'soya')
    WHERE g.code LIKE 'misky_catalog_relleno_%' AND i.code = 'MC-NUTELLA'
      AND JSON_LENGTH(co.allergens) = 2
      AND JSON_CONTAINS(co.allergens, JSON_QUOTE('lacteos'))
      AND JSON_CONTAINS(co.allergens, JSON_QUOTE('soya'))
  `);
  await context.sequelize.query(`
    UPDATE customization_options co
    JOIN inventory_items i ON i.id = co.inventory_item_id
    JOIN customization_groups g ON g.id = co.group_id
    SET co.allergens = JSON_ARRAY()
    WHERE g.code LIKE 'misky_catalog_relleno_%'
      AND i.code IN ('MC-MERMELADA-FRESA', 'MC-MERMELADA-ARANDANOS')
      AND JSON_LENGTH(co.allergens) = 1
      AND JSON_CONTAINS(co.allergens, JSON_QUOTE('lacteos'))
  `);
};

/** No restaura valores antiguos que se saben generados con una regla incorrecta. */
export const down = async (): Promise<void> => {};
