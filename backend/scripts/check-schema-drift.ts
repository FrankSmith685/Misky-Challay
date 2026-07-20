/**
 * DETECTOR DE DERIVA ENTRE MIGRACIONES Y MODELOS
 * ---------------------------------------------------------------------------
 * En desarrollo el esquema se crea con `sequelize.sync()` a partir de los modelos;
 * en produccion se crea aplicando las migraciones. Son dos caminos distintos hacia
 * el mismo sitio, y nada garantiza que lleguen: alguien toca un modelo, no escribe
 * la migracion, y el fallo aparece en produccion.
 *
 * Este script levanta las DOS versiones del esquema en bases temporales, las vuelca
 * y las compara. Si difieren, falta una migracion.
 *
 * Uso:  npm run db:check-drift  --workspace backend
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { env } from '../src/config/env';

const CANDIDATES = [
  'mysqldump',
  'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe',
  'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe',
  '/usr/bin/mysqldump',
  '/usr/local/bin/mysqldump',
];

const findMysqldump = (): string => {
  for (const candidate of CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // siguiente
    }
  }
  throw new Error('No se encontro mysqldump en el PATH ni en las rutas conocidas.');
};

const DB_FROM_MIGRATIONS = `${env.DB_NAME}_drift_migrations`;
const DB_FROM_MODELS = `${env.DB_NAME}_drift_models`;

const rootConnection = (): Sequelize =>
  new Sequelize('', env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'mysql',
    logging: false,
  });

const recreateDatabase = async (name: string): Promise<void> => {
  const root = rootConnection();
  try {
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await root.close();
  }
};

const dropDatabase = async (name: string): Promise<void> => {
  const root = rootConnection();
  try {
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } finally {
    await root.close();
  }
};

/**
 * Normaliza el volcado para que la comparacion mire ESTRUCTURA y no cosmetica.
 *
 * Sequelize nombra las claves foraneas de forma incremental (`_ibfk_1`, `_ibfk_157`),
 * y ese contador depende de cuantas veces se ha recreado la restriccion, no del
 * esquema. Ademas el orden de columnas y restricciones dentro de una tabla puede
 * variar. Se quitan los nombres generados y se ordenan las lineas de cada tabla.
 */
/** La tabla del propio registro de migraciones no forma parte del esquema de negocio. */
const isInfrastructureTable = (block: string): boolean => block.startsWith('`migrations`');

const normalize = (sql: string): string => {
  const tables = sql
    .split(/CREATE TABLE /)
    .slice(1)
    .filter((block) => !isInfrastructureTable(block))
    .map((block) => {
      const body = `CREATE TABLE ${block}`
        .replace(/ AUTO_INCREMENT=\d+/g, '')
        .replace(/CONSTRAINT `[^`]*_ibfk_\d+`/g, 'CONSTRAINT <generado>')
        // mysqldump escribe el CHARACTER SET explicito cuando la columna se creo con
        // esa clausula y lo omite cuando se hereda de la tabla. Es la misma columna
        // escrita de dos formas. Se colapsa la redundante; una collation distinta
        // sigue viendose, que es lo que interesa detectar.
        .replace(/ CHARACTER SET utf8mb4 COLLATE /g, ' COLLATE ')
        .replace(/^\/\*!.*$/gm, '')
        .replace(/^SET .*$/gm, '');

      const lines = body
        .split('\n')
        .map((line) => line.trim().replace(/,$/, ''))
        .filter(Boolean)
        .sort();

      return lines.join('\n');
    })
    .sort();

  return tables.join('\n\n');
};

const dumpSchema = (bin: string, database: string): string => {
  const args = [
    `--host=${env.DB_HOST}`,
    `--port=${env.DB_PORT}`,
    `--user=${env.DB_USER}`,
    '--no-data',
    '--skip-comments',
    '--skip-add-drop-table',
    '--skip-set-charset',
    database,
  ];

  return execFileSync(bin, args, {
    env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
};

/**
 * Estas dos funciones corren en un proceso HIJO, con DB_NAME ya apuntando a la base
 * temporal que creo el padre. No la crean ellas: al recalcular el nombre sobre un
 * DB_NAME ya modificado acabarian creando `..._drift_migrations_drift_migrations`.
 */
const buildFromMigrations = async (): Promise<void> => {
  const { sequelize } = await import('../src/database/connection');
  const { migrator } = await import('../src/database/migrator');

  await migrator.up();
  await sequelize.close();
};

const buildFromModels = async (): Promise<void> => {
  const { sequelize } = await import('../src/database/connection');
  const { registerModels } = await import('../src/database/models');

  registerModels();
  await sequelize.sync({ force: true });
  await sequelize.close();
};

const main = async (): Promise<void> => {
  const bin = findMysqldump();
  const originalDbName = env.DB_NAME;

  try {
    // Cada esquema se construye en un proceso hijo: los modelos de Sequelize se
    // registran contra la conexion al importarse y no se pueden reapuntar en caliente.
    // Los hijos son TypeScript, asi que se lanzan con el CLI de tsx.
    const tsx = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.cjs');

    const buildIn = async (database: string, flag: string): Promise<void> => {
      await recreateDatabase(database);
      execFileSync(process.execPath, [tsx, __filename, flag], {
        stdio: 'inherit',
        env: { ...process.env, DB_NAME: database },
      });
    };

    await buildIn(DB_FROM_MIGRATIONS, '--build-migrations');
    await buildIn(DB_FROM_MODELS, '--build-models');

    const fromMigrations = normalize(dumpSchema(bin, DB_FROM_MIGRATIONS));
    const fromModels = normalize(dumpSchema(bin, DB_FROM_MODELS));

    if (fromMigrations === fromModels) {
      console.log('Sin deriva: las migraciones producen el mismo esquema que los modelos.');
      return;
    }

    console.error('\nDERIVA DETECTADA entre migraciones y modelos.\n');
    console.error('Alguien cambio un modelo sin escribir la migracion correspondiente.');
    console.error('Genera una migracion nueva con:  npm run db:migrate:create --workspace backend\n');

    const a = fromMigrations.split('\n');
    const b = fromModels.split('\n');
    const soloMigraciones = a.filter((line) => !b.includes(line));
    const soloModelos = b.filter((line) => !a.includes(line));

    if (soloModelos.length) {
      console.error('En los MODELOS pero no en las migraciones (falta anadirlo):');
      soloModelos.slice(0, 40).forEach((line) => console.error(`  + ${line}`));
    }
    if (soloMigraciones.length) {
      console.error('\nEn las MIGRACIONES pero no en los modelos (sobra o cambio):');
      soloMigraciones.slice(0, 40).forEach((line) => console.error(`  - ${line}`));
    }

    process.exitCode = 1;
  } finally {
    process.env.DB_NAME = originalDbName;

    // --keep conserva las dos bases temporales para poder inspeccionarlas a mano
    // cuando el diff no deja claro que cambio.
    if (process.argv.includes('--keep')) {
      console.log(`\nBases conservadas: ${DB_FROM_MIGRATIONS} y ${DB_FROM_MODELS}`);
    } else {
      await dropDatabase(DB_FROM_MIGRATIONS);
      await dropDatabase(DB_FROM_MODELS);
    }
  }
};

// Sub-procesos: construyen uno de los dos esquemas y terminan.
if (process.argv.includes('--build-migrations')) {
  void buildFromMigrations().catch((error) => {
    console.error('Fallo al construir el esquema desde migraciones:', error);
    process.exit(1);
  });
} else if (process.argv.includes('--build-models')) {
  void buildFromModels().catch((error) => {
    console.error('Fallo al construir el esquema desde modelos:', error);
    process.exit(1);
  });
} else {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
