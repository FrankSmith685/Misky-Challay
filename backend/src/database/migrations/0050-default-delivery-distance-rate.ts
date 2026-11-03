import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Activa el recargo en la zona inicial sin sobrescribir tarifas definidas por la tienda. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.sequelize.query(`
    UPDATE coverage_zones AS zone
    INNER JOIN cities AS city ON city.id = zone.city_id
    SET zone.extra_fee_per_km = 1.50
    WHERE city.slug = 'lima'
      AND zone.name = 'Lima Centro-Sur'
      AND zone.extra_fee_per_km = 0
      AND zone.extra_coverage_km = 0
      AND zone.polygon IS NOT NULL
  `);
};
