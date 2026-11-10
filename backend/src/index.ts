import { createApp } from './app';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { closeDatabase, initDatabase, type DatabaseStartupOptions } from '@database/bootstrap';
import { getPaymentProvider } from '@integrations/payments';
import { startJobs, stopJobs } from './jobs';
import { installActivityHooks } from '@modules/notifications/activity.service';

/* ==========================================================================
 * INTERRUPTORES DE BASE DE DATOS
 * --------------------------------------------------------------------------
 * Cambia estos valores (o las variables del archivo .env) para decidir que
 * hace el servidor con la base de datos cada vez que arranca.
 *
 *   autoCreate : crea la base `DulceFlow` si todavia no existe.
 *   sync       : true  -> crea/actualiza las tablas a partir de los modelos.
 *                false -> no toca las tablas (usar migraciones o BD ya lista).
 *   alter      : true  -> ajusta columnas nuevas SIN borrar los datos guardados.
 *   force      : true  -> BORRA todas las tablas y las vuelve a crear vacias.
 *                         (usalo solo cuando quieras empezar de cero)
 *   seed       : true  -> inserta los datos base (roles, permisos, admin).
 *                Las opciones alimentarias básicas se aseguran siempre.
 * ========================================================================== */
const DATABASE_STARTUP: DatabaseStartupOptions = {
  autoCreate: env.DB_AUTO_CREATE, // .env -> DB_AUTO_CREATE=true
  sync: env.DB_SYNC, // .env -> DB_SYNC=true
  alter: env.DB_ALTER, // .env -> DB_ALTER=true
  force: env.DB_FORCE, // .env -> DB_FORCE=false  (¡cuidado: borra todo!)
  seed: env.DB_SEED, // .env -> DB_SEED=true
};

const bootstrap = async (): Promise<void> => {
  try {
    // Inicializa y anuncia la pasarela o el simulador al arrancar.
    // Así una configuración antigua del .env se detecta antes de atender solicitudes.
    if (!env.PREVIEW_MODE && (env.MERCADOPAGO_ACCESS_TOKEN || env.STRIPE_SECRET_KEY)) getPaymentProvider();

    await initDatabase(DATABASE_STARTUP);
    installActivityHooks();

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.success(`API lista en http://localhost:${env.PORT}${env.API_PREFIX}`);
      logger.info(`Entorno: ${env.NODE_ENV} | BD: ${env.DB_NAME}@${env.DB_HOST}:${env.DB_PORT}`);
    });

    // Tareas programadas (vencimiento de planes y saldo).
    if (!env.PREVIEW_MODE) startJobs();

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.warn(`${signal} recibido, cerrando servidor...`);

      // Red de seguridad: si una peticion se cuelga, no se puede esperar indefinidamente
      // (el orquestador manda SIGKILL y cortaria una transaccion a medias).
      const forceExit = setTimeout(() => {
        logger.error('El cierre ordenado excedio 15s: saliendo a la fuerza');
        process.exit(1);
      }, 15_000);
      forceExit.unref();

      stopJobs();
      server.close(async () => {
        await closeDatabase();
        clearTimeout(forceExit);
        process.exit(0);
      });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    logger.error('No se pudo iniciar el servidor', error);
    process.exit(1);
  }
};

/**
 * Sin estos handlers, cualquier promesa rechazada sin capturar mata el proceso
 * imprimiendo un aviso de Node que no pasa por el logger: en produccion el incidente
 * quedaba sin registro. Se deja morir el proceso (el estado ya no es fiable), pero
 * primero se registra la causa.
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada sin manejar', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Excepcion no capturada', error);
  process.exit(1);
});

void bootstrap();
