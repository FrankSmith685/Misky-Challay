import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Completa la lista de alergenos relevante para frutas confitadas y postres. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.sequelize.query(
    "INSERT INTO allergens (code, name, warning, created_at, updated_at) SELECT 'sulfitos', 'Sulfitos', NULL, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM allergens WHERE code = 'sulfitos')",
  );
};

/** No elimina opciones que pudieran haber sido usadas en una ficha publicada. */
export const down = async (): Promise<void> => {};
