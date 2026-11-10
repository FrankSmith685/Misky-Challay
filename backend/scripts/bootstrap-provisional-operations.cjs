/** One-time bootstrap for the user-requested provisional production branch. */
const { Branch, sequelize, registerModels } = require('../dist/database/models');
const { seedGeography } = require('../dist/database/seeders/geo.seeder');

(async () => {
  registerModels();
  await sequelize.authenticate();
  const existing = await Branch.findOne({ where: { slug: 'dulceflow-miraflores' } });
  if (existing) {
    console.log('Branch already exists; no provisional values overwritten');
    return;
  }
  await seedGeography();
  const branch = await Branch.findOne({ where: { slug: 'dulceflow-miraflores' } });
  if (!branch) throw new Error('Geography bootstrap did not create the branch');
  await branch.update({
    name: 'Misky Challay · sede provisional',
    addressLine: 'Dirección exacta pendiente de confirmar',
    phone: null,
    acceptsPickup: false,
  });
  console.log('Provisional delivery branch created; pickup disabled until address is configured');
})().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
