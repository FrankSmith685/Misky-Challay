import { Sequelize } from 'sequelize';
import { env } from '@config/env';
import { logger } from '@config/logger';

/**
 * Instancia unica de Sequelize.
 * Los modelos se registran en src/database/models/index.ts
 */
export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: env.DB_LOGGING ? (sql: string) => logger.debug(sql) : false,
  timezone: '+00:00', // Todo se guarda en UTC (seccion 12 del analisis)
  define: {
    underscored: true, // created_at, updated_at, user_id...
    timestamps: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
  dialectOptions: {
    decimalNumbers: true, // decimal como number y no como string
    dateStrings: false,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
});

export default sequelize;
