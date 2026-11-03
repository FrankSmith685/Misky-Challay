import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Umzug, SequelizeStorage, type MigrationParams } from 'umzug';
import type { QueryInterface } from 'sequelize';
import { sequelize } from './connection';
import { logger } from '@config/logger';

/**
 * MIGRACIONES
 * ---------------------------------------------------------------------------
 * El esquema de produccion NO se crea con `sequelize.sync()`. Sync es comodo en
 * desarrollo pero en produccion es inaceptable: no deja historial de que se aplico,
 * no se puede revertir, y `alter: true` decide por su cuenta como transformar una
 * columna —incluido truncar datos— sin preguntar.
 *
 * Cada cambio de esquema vive en un archivo de `migrations/`, se aplica una sola vez
 * y queda registrado en la tabla `migrations`.
 *
 * Formatos admitidos:
 *   - `.sql`  un unico bloque de SQL. Lo usa el baseline.
 *   - `.ts`   exporta `up(params)` y opcionalmente `down(params)`.
 *
 * Convencion de nombres: `0001-descripcion-corta.sql`. El orden lo da el numero.
 */

// __dirname: en dist/ apunta a dist/database, y las migraciones se copian ahi en el build.
export const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const requireMigration = createRequire(__filename);

/** Primera migracion: el esquema completo tal como existia al adoptar migraciones. */
export const BASELINE_NAME = '0001-baseline.sql';

interface MigrationModule {
  up: (params: MigrationParams<QueryInterface>) => Promise<void>;
  down?: (params: MigrationParams<QueryInterface>) => Promise<void>;
}

/**
 * mysql2 no ejecuta varias sentencias en una sola llamada salvo que se habilite
 * `multipleStatements`, que es una puerta abierta a inyeccion. Se parte el archivo
 * y se ejecuta sentencia a sentencia.
 */
const splitStatements = (sql: string): string[] =>
  sql
    // Los comentarios se quitan ANTES de partir. Filtrar despues los bloques que
    // empiezan por "--" descartaba la sentencia que iba pegada a la cabecera.
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

/**
 * Todas las sentencias del archivo se ejecutan sobre LA MISMA conexion.
 *
 * Sequelize reparte las consultas entre un pool, y `FOREIGN_KEY_CHECKS` es una
 * variable de sesion: si cada sentencia sale por una conexion distinta, el
 * `SET FOREIGN_KEY_CHECKS = 0` del baseline se pierde y la primera tabla que
 * referencia a otra que aun no existe falla. Abrir una transaccion fija la conexion.
 *
 * Ojo: en MySQL el DDL provoca commit implicito, asi que esto NO da atomicidad
 * —una migracion a medias no se revierte sola—. Solo garantiza la misma sesion.
 */
const runSqlFile = async (filePath: string): Promise<void> => {
  const sql = await fs.readFile(filePath, 'utf8');
  const statements = splitStatements(sql);

  const transaction = await sequelize.transaction();
  try {
    for (const statement of statements) {
      await sequelize.query(statement, { transaction });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
};

export const migrator = new Umzug({
  migrations: {
    glob: ['*.{sql,ts,js}', { cwd: MIGRATIONS_DIR }],
    resolve: ({ name, path: filePath, context }) => {
      if (!filePath) throw new Error(`Migracion sin ruta: ${name}`);

      if (filePath.endsWith('.sql')) {
        return {
          name,
          up: async () => runSqlFile(filePath),
          // El baseline y los volcados de SQL no se revierten automaticamente:
          // deshacerlos significaria borrar el esquema entero.
          down: async () => {
            throw new Error(`La migracion ${name} es SQL plano y no se puede revertir`);
          },
        };
      }

      // En Windows una ruta absoluta ("c:\...") no es una URL valida para import():
      // el cargador la interpreta como el protocolo "c:". pathToFileURL la normaliza.
      const load = async (): Promise<MigrationModule> =>
        requireMigration(filePath) as MigrationModule;

      return {
        name,
        up: async () => {
          const loaded = await load();
          await loaded.up({ name, path: filePath, context });
        },
        down: async () => {
          const loaded = await load();
          if (!loaded.down) throw new Error(`La migracion ${name} no define down()`);
          await loaded.down({ name, path: filePath, context });
        },
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, modelName: 'SchemaMigration', tableName: 'migrations' }),
  logger: {
    info: (message) => logger.info(String(message.event ?? message.name ?? message)),
    warn: (message) => logger.warn(String(message)),
    error: (message) => logger.error(String(message)),
    debug: () => undefined,
  },
});

export type Migrator = typeof migrator;

/**
 * Bases que ya existian antes de adoptar migraciones.
 *
 * Si hay tablas de negocio pero la tabla `migrations` esta vacia, el esquema ya
 * corresponde al baseline: aplicarlo reventaria con "table already exists". Se marca
 * como aplicado sin ejecutarlo. En una base vacia no hace nada y el baseline corre
 * con normalidad.
 */
export const adoptExistingSchema = async (): Promise<boolean> => {
  const applied = await migrator.executed();
  if (applied.length > 0) return false;

  const [tables] = await sequelize.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'orders'",
  );

  if ((tables as unknown[]).length === 0) return false;

  const storage = migrator.options.storage;
  if (!storage) throw new Error('El migrador no tiene almacenamiento configurado');

  await storage.logMigration({ name: BASELINE_NAME, context: sequelize.getQueryInterface() });

  logger.warn(
    `Esquema preexistente detectado: ${BASELINE_NAME} se marca como aplicado sin ejecutarse.`,
  );
  return true;
};
