import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Retira el mínimo de la zona inicial; conserva mínimos personalizados de otras zonas. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.sequelize.query(`
    UPDATE coverage_zones AS zone
    INNER JOIN cities AS city ON city.id = zone.city_id
    SET zone.minimum_order = 0
    WHERE city.slug = 'lima'
      AND zone.name = 'Lima Centro-Sur'
      AND zone.minimum_order = 25
  `);
};
