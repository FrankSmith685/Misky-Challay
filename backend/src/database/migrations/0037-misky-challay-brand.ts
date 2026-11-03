import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Actualiza únicamente los nombres predeterminados antiguos; respeta nombres personalizados. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.sequelize.query(
    "UPDATE business_settings SET commercial_name = 'Misky Challay' WHERE id = 1 AND commercial_name = 'DulceFlow'",
  );
  await context.sequelize.query(
    "UPDATE business_settings SET legal_name = 'Misky Challay (datos legales pendientes)' WHERE id = 1 AND legal_name = 'DulceFlow (datos legales pendientes)'",
  );
  await context.sequelize.query(
    "UPDATE branches SET name = 'Misky Challay Miraflores' WHERE name = 'DulceFlow Miraflores'",
  );
};

/** El nombre comercial puede haber sido editado después; revertirlo sobrescribiría esa decisión. */
export const down = async (): Promise<void> => {};
