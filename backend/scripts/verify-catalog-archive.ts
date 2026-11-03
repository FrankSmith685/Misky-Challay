/** Comprueba el borrado lógico en la base local y revierte los cambios de prueba. */
import { Product, registerModels, sequelize } from '../src/database/models';
import { env } from '../src/config/env';
import { catalogAdminService } from '../src/modules/admin/catalogAdmin.service';

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)
    || env.DB_NAME !== 'DulceFlow' || env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Esta verificación solo se permite en la base local de desarrollo');
  }
  registerModels();
  await sequelize.authenticate();
  const current = await catalogAdminService.listProducts({});
  const archived = await catalogAdminService.listProducts({ archived: true });
  const candidate = await Product.findOne({ where: { status: 'INACTIVE' }, attributes: ['id', 'name'] });
  if (!candidate) throw new Error('No hay un producto retirado para comprobar el archivado reversible');

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(candidate.id, { transaction });
    if (!product) throw new Error('Desapareció el producto de prueba');
    await product.destroy({ transaction });
    const hidden = await Product.findByPk(candidate.id, { transaction });
    const archivedInside = await Product.findByPk(candidate.id, { paranoid: false, transaction });
    if (hidden || !archivedInside?.deletedAt || archivedInside.status !== 'INACTIVE') {
      throw new Error('El borrado lógico no ocultó el producto o cambió su estado');
    }
    await archivedInside.restore({ transaction });
    const restored = await Product.findByPk(candidate.id, { transaction });
    if (!restored || restored.status !== 'INACTIVE') throw new Error('La restauración no devolvió la ficha retirada');
  } finally {
    await transaction.rollback();
  }
  if (!await Product.findByPk(candidate.id)) throw new Error('La comprobación modificó la base local');
  console.log(JSON.stringify({ currentCount: current.length, archivedCount: archived.length, testedProductId: candidate.id, archiveAndRestoreRolledBack: true }, null, 2));
};

main().catch((error) => { console.error(`Verificación falló: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
