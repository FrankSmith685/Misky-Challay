/**
 * Crea el esquema desde los modelos y siembra los datos base.
 *
 * Lo mismo que hace el arranque del servidor, pero sin levantar el HTTP. Lo usa
 * `db:rebuild` y sirve para reconstruir la base local tras un cambio de modelos que
 * `alter` no sabe aplicar (politica de borrado de las claves foraneas, por ejemplo).
 */
import { initDatabase, closeDatabase } from '../src/database/bootstrap';
import { logger } from '../src/config/logger';

const main = async (): Promise<void> => {
  await initDatabase({
    autoCreate: true,
    sync: true,
    alter: false,
    force: process.argv.includes('--force'),
    seed: !process.argv.includes('--no-seed'),
  });

  await closeDatabase();
  logger.success('Esquema creado y datos base sembrados.');
};

main().catch((error) => {
  logger.error('Fallo al crear el esquema', error);
  process.exit(1);
});
