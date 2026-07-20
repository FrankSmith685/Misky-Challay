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
