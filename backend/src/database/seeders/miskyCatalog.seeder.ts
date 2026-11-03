import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { Product } from '../models';

/** Ejecuta las cargas reproducibles que alimentan el catálogo local de Misky. */
const runScript = (scriptName: string): Promise<void> => new Promise((resolve, reject) => {
  const scriptPath = path.resolve(__dirname, '../../../scripts', scriptName);
  const child = spawn(process.execPath, [scriptPath, '--execute'], {
    cwd: path.resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      SEED_MISKY_CATALOG: 'true',
      // El disco de Render es efímero; no generamos un dump en cada reinicio.
      SEED_MISKY_CATALOG_BACKUP: 'false',
    },
    stdio: 'inherit',
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${scriptName} terminó con código ${code ?? 'nulo'}${signal ? ` (${signal})` : ''}`));
  });
});

export const seedMiskyCatalog = async (): Promise<void> => {
  if (!env.SEED_MISKY_CATALOG) return;
  if (env.NODE_ENV === 'production' || env.MERCADOPAGO_MODE === 'live') {
    throw new Error('SEED_MISKY_CATALOG solo se permite en el entorno de pruebas');
  }

  // Evita que un reinicio vuelva a sobrescribir ediciones hechas desde el panel.
  const existing = await Product.findOne({ where: { slug: 'torta-a-tu-gusto' }, paranoid: false });
  if (existing) {
    logger.info('Catálogo Misky Challay ya existe; se conserva la configuración del panel');
    return;
  }

  logger.warn('SEED_MISKY_CATALOG activo: cargando el catálogo local de Misky Challay');
  await runScript('seed-misky-cake-supplies.cjs');
  await runScript('seed-misky-cake-catalog.cjs');
  logger.success('Catálogo local de Misky Challay cargado');
};
