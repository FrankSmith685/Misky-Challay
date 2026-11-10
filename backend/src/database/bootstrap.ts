import mysql from 'mysql2/promise';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { seedCheckoutTerms } from './seeders/checkoutTerms.seeder';
import { databaseSsl, sequelize } from './connection';
import { registerModels } from './models';
import { runSeeders } from './seeders';
import { seedFoodTaxonomy } from './seeders/foodTaxonomy.seeder';

export interface DatabaseStartupOptions {
  /** Crea la base de datos si todavia no existe. */
  autoCreate: boolean;
  /** Sincroniza los modelos con las tablas al arrancar. */
  sync: boolean;
  /** Ajusta las tablas existentes sin perder datos (ALTER TABLE). */
  alter: boolean;
  /** DROP + CREATE de todas las tablas. Cuidado: borra toda la informacion. */
  force: boolean;
  /** Ejecuta los seeders base; la taxonomía alimentaria se asegura incluso si es false. */
  seed: boolean;
}

/**
 * Paso 1: crear la base de datos si no existe.
 * Se conecta al servidor MySQL sin seleccionar esquema para poder crearlo.
 */
const ensureDatabaseExists = async (): Promise<void> => {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: databaseSsl,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );
    logger.success(`Base de datos "${env.DB_NAME}" disponible`);
  } finally {
    await connection.end();
  }
};

/**
 * Compatibilidad para bases de desarrollo creadas antes del QR de salón.
 *
 * `sequelize.sync({ alter: true })` agrega un UUID NOT NULL como `''` a cada
 * fila existente y acto seguido intenta crear su índice único. El índice falla
 * porque todas las mesas comparten ese valor vacío. La columna del modelo se
 * mantiene nullable durante el alter (varios NULL sí son válidos en un UNIQUE)
 * y aquí convertimos NULL/vacíos en UUID reales. Se ejecuta dos veces: antes,
 * para reparar un arranque parcial, y después, para completar una columna nueva.
 */
const repairDiningQrTokens = async (): Promise<void> => {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'dining_tables'");
  if (!Array.isArray(tables) || tables.length === 0) return;

  const [columns] = await sequelize.query("SHOW COLUMNS FROM `dining_tables` LIKE 'qr_token'");
  if (!Array.isArray(columns) || columns.length === 0) return;

  const [, metadata] = await sequelize.query(
    "UPDATE `dining_tables` SET `qr_token` = UUID() WHERE `qr_token` IS NULL OR `qr_token` = ''",
  );
  const changed = typeof metadata === 'object' && metadata && 'affectedRows' in metadata
    ? Number((metadata as { affectedRows: number }).affectedRows)
    : 0;
  if (changed > 0) logger.info(`QR de salón reparados: ${changed} mesa(s)`);
};

/**
 * Bases creadas antes de que `PurchaseOrder.createdBy` fuera opcional pueden
 * conservar la columna como NOT NULL. La asociación usa ON DELETE SET NULL,
 * así que MySQL rechaza la FK durante `sequelize.sync({ alter: true })` antes
 * de tener oportunidad de ajustar la columna con el modelo nuevo.
 */
const repairPurchaseOrderAuthor = async (): Promise<void> => {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'purchase_orders'");
  if (!Array.isArray(tables) || tables.length === 0) return;

  const [columns] = await sequelize.query("SHOW COLUMNS FROM `purchase_orders` LIKE 'created_by'");
  const createdBy = Array.isArray(columns)
    ? (columns[0] as { Null?: string } | undefined)
    : undefined;
  if (!createdBy || String(createdBy.Null).toUpperCase() === 'YES') return;

  await sequelize.query(
    'ALTER TABLE `purchase_orders` MODIFY COLUMN `created_by` BIGINT UNSIGNED NULL',
  );
  logger.info('Columna purchase_orders.created_by ajustada a NULL para conservar la orden si se elimina su autor');
};

/**
 * Arranque completo de la capa de datos:
 * crear BD -> registrar modelos + asociaciones -> autenticar -> sincronizar -> seeders.
 */
export const initDatabase = async (options: DatabaseStartupOptions): Promise<void> => {
  if (options.autoCreate) {
    await ensureDatabaseExists();
  }

  registerModels();

  await sequelize.authenticate();
  logger.success(`Conexion MySQL establecida (${env.DB_HOST}:${env.DB_PORT})`);

  if (options.sync) {
    await repairDiningQrTokens();
    await repairPurchaseOrderAuthor();
    if (options.force) {
      logger.warn('DB_FORCE activo: se eliminaran y recrearan TODAS las tablas');
      await sequelize.sync({ force: true });
    } else if (options.alter) {
      await sequelize.sync({ alter: true });
      logger.success('Modelos sincronizados (alter: se ajustaron las tablas existentes)');
    } else {
      await sequelize.sync();
      logger.success('Modelos sincronizados (solo se crearon tablas faltantes)');
    }
    await repairDiningQrTokens();
  } else {
    logger.info('Sincronizacion desactivada: se usan las tablas tal como estan');
  }

  if (options.seed) {
    await runSeeders();
  } else {
    // Los alérgenos son necesarios para revisar y publicar productos. También
    // deben existir cuando se omite el bootstrap de roles y datos de ejemplo.
    await seedFoodTaxonomy();
  }
  await seedCheckoutTerms();
};

export const closeDatabase = async (): Promise<void> => {
  await sequelize.close();
  logger.info('Conexion MySQL cerrada');
};
