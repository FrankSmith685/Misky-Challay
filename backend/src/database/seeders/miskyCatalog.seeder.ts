import { spawn } from 'node:child_process';
import path from 'node:path';
import { Op } from 'sequelize';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { CakeProductProfile, CustomizationGroup, CustomizationOption, Product, ProductCustomizationGroup, ProductVariant } from '../models';

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

  // Solo conservamos una ficha cuando realmente está completa. Una base puede
  // tener un producto viejo con este slug, pero sin variantes, perfil activo o
  // revisión de alérgenos; en ese caso el menú público continúa vacío.
  const existing = await Product.findOne({ where: { slug: 'torta-a-tu-gusto' }, paranoid: false });
  const variantCount = existing
    ? await ProductVariant.count({ where: { productId: existing.id, isActive: true } })
    : 0;
  const profile = existing ? await CakeProductProfile.findByPk(existing.id) : null;
  const customizationLinks = existing
    ? await ProductCustomizationGroup.findAll({ where: { productId: existing.id, isActive: true } })
    : [];
  const customizationGroupIds = customizationLinks.map((link) => link.groupId);
  const customizationGroups = customizationGroupIds.length
    ? await CustomizationGroup.findAll({ where: { id: { [Op.in]: customizationGroupIds }, isActive: true } })
    : [];
  const optionCounts = new Map<number, number>();
  await Promise.all(customizationGroups.map(async (group) => {
    optionCounts.set(group.id, await CustomizationOption.count({ where: { groupId: group.id, status: 'ACTIVE' } }));
  }));
  const groupById = new Map(customizationGroups.map((group) => [group.id, group]));
  const activeVariants = existing
    ? await ProductVariant.findAll({ where: { productId: existing.id, isActive: true }, attributes: ['id'] })
    : [];
  const requiredGroupFragments = ['sabor', 'relleno', 'cobertura', 'decoracion'];
  const hasReadyGroup = (link: typeof customizationLinks[number]) => {
    const group = groupById.get(link.groupId);
    return Boolean(group && (optionCounts.get(group.id) || 0) > 0);
  };
  // La torta personalizada necesita 3 tamaños con bizcocho y relleno, más
  // cobertura y decoración, además del grupo opcional de adicionales:
  // 7 enlaces y al menos una opción activa por grupo.
  const requiredGroupsComplete = activeVariants.length >= 3 && activeVariants.every((variant) => {
    const links = customizationLinks.filter((link) => Number(link.variantId) === Number(variant.id) && hasReadyGroup(link));
    return requiredGroupFragments.every((fragment) => links.some((link) => groupById.get(link.groupId)?.code.includes(`misky_catalog_${fragment}_`)));
  });
  const addonsComplete = customizationLinks.some((link) => link.variantId === null
    && groupById.get(link.groupId)?.code === 'misky_catalog_complementos'
    && hasReadyGroup(link));
  const customizationComplete = requiredGroupsComplete && addonsComplete;
  const complete = Boolean(
    existing
    && existing.status === 'ACTIVE'
    && existing.allergensReviewedAt
    && variantCount >= 3
    && profile?.isActive
    && profile.saleMode === 'SEMI_CUSTOM'
    && customizationComplete,
  );
  if (complete) {
    logger.info('Catálogo Misky Challay ya existe; se conserva la configuración del panel');
  } else {
    if (existing) logger.warn('Catálogo Misky Challay incompleto; se ejecutará una carga de reparación');
    logger.warn('SEED_MISKY_CATALOG activo: cargando el catálogo local de Misky Challay');
    await runScript('seed-misky-cake-supplies.cjs');
    await runScript('seed-misky-cake-catalog.cjs');
  }

  // Se ejecuta también cuando la torta base ya existe para completar categorías
  // que se agregaron después (turrones, kekes, fatias y bocaditos).
  await runScript('seed-misky-pastry-catalog.cjs');
  await runScript('seed-misky-cake-themes.cjs');
  logger.success('Catálogo local de Misky Challay cargado');
};
