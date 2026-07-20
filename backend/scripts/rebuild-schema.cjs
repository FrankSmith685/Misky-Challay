#!/usr/bin/env node
/**
 * Recrea la base de desarrollo desde cero y vuelve a capturar el baseline.
 *
 * DESTRUCTIVO: borra la base entera. Solo tiene sentido en local, y solo cuando se
 * cambia algo que Sequelize no sabe migrar en caliente —politica de borrado de las
 * claves foraneas, nombres de indices—, o cuando el baseline arrastra nombres de
 * restriccion generados por anos de `alter` (los `_ibfk_157`).
 *
 * Uso:  node scripts/rebuild-schema.cjs
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DB = process.env.DB_NAME || 'verde_bowl_v3';
const BACKEND = path.resolve(__dirname, '..');

const run = (command, args, env) =>
  execFileSync(command, args, { cwd: BACKEND, stdio: 'inherit', env: { ...process.env, ...env } });

const confirm = () =>
  new Promise((resolve) => {
    if (process.argv.includes('--yes')) return resolve(true);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Se va a BORRAR la base "${DB}" y recrearla. Escribe el nombre para confirmar: `, (answer) => {
      rl.close();
      resolve(answer.trim() === DB);
    });
  });

const main = async () => {
  if (!(await confirm())) {
    console.log('Cancelado.');
    process.exit(1);
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  console.log('\n1. Recreando el esquema desde los modelos...');
  run(npm, ['run', 'db:seed'], { DB_FORCE: 'true', DB_SYNC: 'true', DB_ALTER: 'false' });

  console.log('\n2. Recapturando el baseline...');
  run('node', ['scripts/dump-baseline.cjs']);

  console.log('\n3. Registrando el baseline como aplicado...');
  run(npm, ['run', 'db:migrate']);

  console.log('\nListo. Revisa el diff de 0001-baseline.sql antes de commitear.');
};

void main();
