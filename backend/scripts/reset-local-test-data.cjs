/** Limpia datos de prueba locales y conserva accesos y configuracion operativa. */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const KEEP = new Set([
  'migrations', 'permissions', 'roles', 'role_permissions', 'users', 'user_roles',
  'cities', 'districts', 'branches', 'branch_schedules', 'coverage_zones',
  'zone_branches', 'delivery_slots', 'cake_station_capacities',
  'business_settings', 'communication_settings', 'local_payment_settings',
  'receipt_settings',
]);

function assertLocalDatabase() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Solo se permite NODE_ENV=development');
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) {
    throw new Error('Solo se permite una base de datos local');
  }
  if (process.env.DB_NAME !== 'DulceFlow') throw new Error('La base debe llamarse DulceFlow');
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL');
  if (process.env.SEED_DEMO_DATA !== 'false') throw new Error('Desactiva SEED_DEMO_DATA antes de limpiar');
  if (process.env.MERCADOPAGO_MODE === 'live') throw new Error('No se limpia con Mercado Pago en modo live');
}

async function assertBackendStopped() {
  const listening = await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(process.env.PORT || 4000) });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  if (listening) throw new Error('Deten npm run dev antes de limpiar la base de datos');
}

function createBackup() {
  const dir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `DulceFlow-before-reset-${stamp}.sql`);
  const candidates = [
    process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'mysqldump',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump');
  const args = [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`,
    `--user=${process.env.DB_USER}`, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error(`No se pudo crear el respaldo: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  const contents = fs.readFileSync(file, 'utf8');
  const tableCount = (contents.match(/CREATE TABLE `/g) || []).length;
  if (contents.length < 10000 || tableCount < 90) {
    fs.rmSync(file);
    throw new Error(`Respaldo incompleto: ${tableCount} tablas`);
  }
  return { file, tableCount, bytes: fs.statSync(file).size };
}

async function main() {
  assertLocalDatabase();
  const execute = process.argv.includes('--execute');
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [tables] = await db.query('SHOW FULL TABLES');
    const allNames = tables.map((row) => Object.values(row)[0]);
    if (allNames.length < 90 || ![...KEEP].every((name) => allNames.includes(name))) {
      throw new Error('El esquema no coincide con el reinicio esperado');
    }
    if (!allNames.every((name) => /^[a-z][a-z0-9_]*$/.test(name))) {
      throw new Error('Nombre de tabla inesperado');
    }
    const [owners] = await db.query(
      'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?',
      [process.env.ADMIN_EMAIL, 'ACTIVE'],
    );
    if (owners.length !== 1) throw new Error('La cuenta propietaria activa no se pudo verificar');
    const toClear = allNames.filter((name) => !KEEP.has(name));
    if (!execute) {
      console.log(`Simulacion: se limpiarian ${toClear.length} tablas; se conservarian ${KEEP.size} tablas de acceso y configuracion.`);
      console.log('Ejecuta con --execute para crear un respaldo y limpiar.');
      return;
    }
    await assertBackendStopped();
    const backup = createBackup();
    console.log(`Respaldo verificado: ${backup.file} (${backup.tableCount} tablas, ${backup.bytes} bytes)`);
    await db.query('SET SESSION FOREIGN_KEY_CHECKS=0');
    await db.beginTransaction();
    try {
      for (const name of toClear) await db.query(`DELETE FROM \`${name}\``);
      await db.query('UPDATE delivery_slots SET reserved_count=0, confirmed_count=0');
      await db.query('UPDATE cake_station_capacities SET reserved_minutes=0, confirmed_minutes=0');
      for (const name of toClear) {
        const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
        if (row.n !== 0) throw new Error(`La tabla ${name} no quedo vacia`);
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      await db.query('SET SESSION FOREIGN_KEY_CHECKS=1');
    }
    console.log(`Limpieza terminada: ${toClear.length} tablas vacias. Accesos y configuracion conservados.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
