import { logger } from '@config/logger';
import { env } from '@config/env';
import { sequelize } from '../connection';
import { registerModels } from '../models';
import { seedRbac } from './rbac.seeder';
import { seedGeography, seedUbigeo } from './geo.seeder';
import { seedCakes } from './cakes.seeder';
import { seedCoupons } from './coupon.seeder';
import { seedFoodTaxonomy } from './foodTaxonomy.seeder';
import { seedSubscriptionPlans } from './subscriptionPlans.seeder';
import { seedMiskyCatalog } from './miskyCatalog.seeder';

/**
 * Seeders idempotentes: se pueden ejecutar en cada arranque sin duplicar datos.
 * Agrega aqui los seeders de planes, promociones, etc.
 */
export const runSeeders = async (): Promise<void> => {
  logger.info('Ejecutando bootstrap esencial...');
  await seedRbac();
  await seedFoodTaxonomy();

  if (env.SEED_DEMO_DATA) {
    logger.warn('SEED_DEMO_DATA activo: se cargarán datos comerciales de demostración');
    await seedGeography();
    await seedCakes();
    await seedCoupons();
    // Los datos de bowls, planes y salón anteriores permanecen en la base para
    // conservar historial, pero el catálogo público muestra solo perfiles de torta.
  } else {
    await seedUbigeo();
    logger.info('Datos demo desactivados: la operación se gestiona desde el panel');
  }

  if (env.SEED_MISKY_CATALOG) {
    // El catálogo necesita una sede activa. Esto es independiente de los
    // bowls de demostración controlados por SEED_DEMO_DATA.
    await seedGeography();
    await seedMiskyCatalog();
  }

  await seedSubscriptionPlans();

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
