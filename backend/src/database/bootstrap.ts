import mysql from 'mysql2/promise';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { sequelize } from './connection';
import { registerModels } from './models';
import { runSeeders } from './seeders';

export interface DatabaseStartupOptions {
  /** Crea la base de datos si todavia no existe. */
  autoCreate: boolean;
  /** Sincroniza los modelos con las tablas al arrancar. */
  sync: boolean;
  /** Ajusta las tablas existentes sin perder datos (ALTER TABLE). */
  alter: boolean;
  /** DROP + CREATE de todas las tablas. Cuidado: borra toda la informacion. */
  force: boolean;
  /** Ejecuta los seeders base (roles, permisos, admin) al terminar. */
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
 * Compatibilidad para bases de desarrollo creadas antes del QR de salÃ³n.
 *
 * `sequelize.sync({ alter: true })` agrega un UUID NOT NULL como `''` a cada
 * fila existente y acto seguido intenta crear su Ã­ndice Ãºnico. El Ã­ndice falla
 * porque todas las mesas comparten ese valor vacÃ­o. La columna del modelo se
 * mantiene nullable durante el alter (varios NULL sÃ­ son vÃ¡lidos en un UNIQUE)
 * y aquÃ­ convertimos NULL/vacÃ­os en UUID reales. Se ejecuta dos veces: antes,
 * para reparar un arranque parcial, y despuÃ©s, para completar una columna nueva.
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
  if (changed > 0) logger.info(`QR de salÃ³n reparados: ${changed} mesa(s)`);
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
  }
};

export const closeDatabase = async (): Promise<void> => {
  await sequelize.close();
  logger.info('Conexion MySQL cerrada');
};
