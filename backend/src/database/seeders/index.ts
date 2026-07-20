import { logger } from '@config/logger';
import { env } from '@config/env';
import { sequelize } from '../connection';
import { registerModels } from '../models';
import { seedRbac } from './rbac.seeder';
import { seedGeography, seedUbigeo } from './geo.seeder';
import { seedCatalog } from './catalog.seeder';
import { seedCoupons } from './coupon.seeder';
import { seedOperations } from './operations.seeder';
import { seedPlans } from './plan.seeder';

/**
 * Seeders idempotentes: se pueden ejecutar en cada arranque sin duplicar datos.
 * Agrega aqui los seeders de planes, promociones, etc.
 */
export const runSeeders = async (): Promise<void> => {
  logger.info('Ejecutando bootstrap esencial...');
  await seedRbac();

  if (env.SEED_DEMO_DATA) {
    logger.warn('SEED_DEMO_DATA activo: se cargarán datos comerciales de demostración');
    await seedGeography();
    await seedCatalog();
    await seedCoupons();
    await seedOperations();
    await seedPlans();
  } else {
    await seedUbigeo();
    logger.info('Datos demo desactivados: la operación se gestiona desde el panel');
  }

  logger.success('Bootstrap completado');
};

/** Permite ejecutarlos manualmente: npm run db:seed */
const isDirectRun = require.main === module;

if (isDirectRun) {
  (async () => {
    try {
      registerModels();
      await sequelize.authenticate();
      await runSeeders();
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      logger.error('Fallo la ejecucion de seeders', error);
      process.exit(1);
    }
  })();
}
