#!/usr/bin/env node
/**
 * Captura el esquema actual de la base de datos como migracion inicial.
 *
 * Se ejecuta UNA sola vez, al adoptar migraciones: congela el esquema que hasta
 * ahora generaba `sequelize.sync({ alter: true })`. A partir de aqui, cada cambio
 * es un archivo nuevo en migrations/.
 *
 * Solo estructura (--no-data): los datos base los siguen sembrando los seeders.
 *
 * Uso:  node scripts/dump-baseline.cjs [ruta-de-salida]
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const CANDIDATES = [
  'mysqldump',
  'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe',
  'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe',
  '/usr/bin/mysqldump',
  '/usr/local/bin/mysqldump',
];

const findMysqldump = () => {
  for (const candidate of CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // siguiente
    }
  }
  throw new Error(
    'No se encontro mysqldump. Anadelo al PATH o edita CANDIDATES en este script.',
  );
};

const main = () => {
  const out =
    process.argv[2] ??
    path.resolve(__dirname, '..', 'src', 'database', 'migrations', '0001-baseline.sql');

  const database = process.env.DB_NAME || 'verde_bowl_v3';
  const bin = findMysqldump();

  const args = [
    `--host=${process.env.DB_HOST || 'localhost'}`,
    `--port=${process.env.DB_PORT || '3306'}`,
    `--user=${process.env.DB_USER || 'root'}`,
    '--no-data',
    '--skip-comments',
    '--skip-add-locks',
    // Sin DROP TABLE: un baseline no puede ser capaz de vaciar una base con datos.
    '--skip-add-drop-table',
    '--skip-set-charset',
    '--single-transaction',
    '--routines=false',
    '--triggers=false',
    database,
  ];

  // La contrasena va por entorno, nunca por argumento: en la linea de comandos
  // seria visible para cualquier proceso del sistema.
  const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' };

  let sql = execFileSync(bin, args, { env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

  sql = sql
    // El contador de AUTO_INCREMENT es estado, no esquema: incluirlo haria que el
    // baseline cambiara en cada volcado sin que el esquema hubiese cambiado.
    .replace(/ AUTO_INCREMENT=\d+/g, '')
    // Comentarios ejecutables de mysqldump: se sustituyen por sentencias explicitas.
    .replace(/^\/\*!.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const header = [
    '-- Migracion inicial: esquema completo de Verde Bowl V3.',
    '--',
    '-- Generada con scripts/dump-baseline.cjs a partir de la base de desarrollo,',
    '-- que hasta ahora se creaba con sequelize.sync(). Congela ese esquema para que',
    '-- produccion pueda levantarse de forma reproducible y sin sync.',
    '--',
    '-- NO editar este archivo. Cualquier cambio posterior va en una migracion nueva.',
    '',
    '-- Las tablas van en orden alfabetico, asi que una clave foranea puede apuntar a',
    '-- una tabla que todavia no existe. Se desactiva la comprobacion mientras se crea',
    '-- el esquema y se restaura al terminar.',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ].join('\n');

  const footer = ['', 'SET FOREIGN_KEY_CHECKS = 1;', ''].join('\n');

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${header}\n${sql}\n${footer}`, 'utf8');

  const tables = (sql.match(/CREATE TABLE/g) || []).length;
  console.log(`Baseline escrito en ${out}`);
  console.log(`${tables} tablas · ${(sql.length / 1024).toFixed(0)} KB`);
};

main();
