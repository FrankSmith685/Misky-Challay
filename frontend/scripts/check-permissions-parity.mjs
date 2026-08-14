/**
 * Comprueba que el espejo de permisos del frontend (src/constants/permissions.ts)
 * sea IDENTICO al catalogo del backend (backend/src/config/constants.ts).
 *
 * El espejo no es documentacion: de el cuelgan el menu, la lista blanca de /admin
 * y el gating de cada boton. Cuando se quedo corto (33 de 36) nadie se entero,
 * porque un permiso que no existe en el espejo simplemente no se puede escribir
 * en ninguna pantalla: el Repartidor no se podia distinguir del Despachador,
 * los pagos no tenian donde pintarse y Planes seguia cerrado a plan.read. Un
 * fallo silencioso de RBAC visual. Este check lo convierte en un fallo de build.
 *
 * Compara CLAVE y VALOR en los dos sentidos: sobra, falta o apunta a otro codigo.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIRROR = join(ROOT, 'src', 'constants', 'permissions.ts');
const SOURCE = join(ROOT, '..', 'backend', 'src', 'config', 'constants.ts');

/** Extrae `export const <nombre> = { ... }` equilibrando llaves. */
const readObjectBlock = (text, name, file) => {
  const at = text.indexOf(`export const ${name}`);
  if (at === -1) throw new Error(`No se encontro "export const ${name}" en ${file}`);
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`El objeto ${name} no esta cerrado en ${file}`);
};

/** Pares CLAVE: 'valor' del bloque, ignorando comentarios de linea. */
const readEntries = (block) => {
  const entries = new Map();
  const withoutComments = block.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, key, value] of withoutComments.matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/g)) {
    entries.set(key, value);
  }
  return entries;
};

const run = async () => {
  let sourceText;
  try {
    sourceText = await readFile(SOURCE, 'utf8');
  } catch {
    // El frontend se puede construir suelto (sin la carpeta backend al lado).
    // Ahi no hay nada contra que comparar: se avisa alto y claro y no se falla.
    console.warn(`check-permissions-parity: OMITIDO — no se encontro ${SOURCE}.`);
    return;
  }

  const backend = readEntries(readObjectBlock(sourceText, 'PERMISSIONS', SOURCE));
  const frontend = readEntries(readObjectBlock(await readFile(MIRROR, 'utf8'), 'PERM', MIRROR));

  if (backend.size === 0) throw new Error('PERMISSIONS del backend no declara ningun permiso');

  const problems = [];
  for (const [key, value] of backend) {
    if (!frontend.has(key)) problems.push(`FALTA en el espejo: ${key} = '${value}'`);
    else if (frontend.get(key) !== value) {
      problems.push(`DIVERGE ${key}: backend '${value}' vs espejo '${frontend.get(key)}'`);
    }
  }
  for (const [key, value] of frontend) {
    if (!backend.has(key)) problems.push(`SOBRA en el espejo: ${key} = '${value}' (el backend no lo define)`);
  }

  if (problems.length === 0) {
    console.log(`check-permissions-parity: OK — ${backend.size} permisos identicos en backend y frontend.`);
    return;
  }

  console.error(`check-permissions-parity: ${problems.length} divergencia(s) entre backend y frontend.`);
  console.error('El menu, la lista blanca de /admin y el gating de botones cuelgan de este espejo.\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nSincroniza src/constants/permissions.ts con backend/src/config/constants.ts.');
  process.exitCode = 1;
};

run().catch((error) => {
  console.error(`check-permissions-parity: ${error.message}`);
  process.exitCode = 1;
});
