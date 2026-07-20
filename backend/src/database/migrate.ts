import { sequelize } from './connection';
import { adoptExistingSchema, migrator } from './migrator';
import { logger } from '@config/logger';

/**
 * CLI de migraciones.
 *
 *   npm run db:migrate            aplica lo pendiente
 *   npm run db:migrate:status     que hay aplicado y que falta
 *   npm run db:migrate:undo       revierte la ultima
 *   npm run db:migrate:create --name=agrega-tal-columna
 *
 * En produccion el arranque NO aplica migraciones solo: se ejecutan como paso
 * explicito del despliegue, antes de levantar la nueva version. Asi un fallo de
 * migracion detiene el despliegue en lugar de dejar el servicio a medias.
 */
const main = async (): Promise<void> => {
  await sequelize.authenticate();

  // Base anterior a las migraciones: se adopta marcando el baseline como aplicado.
  await adoptExistingSchema();

  await migrator.runAsCLI();
};

main().catch((error) => {
  logger.error('Fallo la migracion', error);
  process.exit(1);
});
