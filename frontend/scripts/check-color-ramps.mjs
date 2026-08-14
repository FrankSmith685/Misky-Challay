/**
 * Comprueba que toda parada de rampa usada en el codigo tenga su variable
 * declarada en el bloque @theme de src/styles/index.css.
 *
 * Tailwind v4 genera las utilidades A PARTIR de ese bloque: una parada sin
 * declarar no rompe el build, simplemente no pinta. Asi es como `bg-accent-50`,
 * `border-accent-300` y `text-accent-700` llegaron a produccion transparentes
 * mientras el aviso de "sin cobertura" del carrito se veia igual que el de con
 * cobertura. Este check convierte ese silencio en un fallo de build.
 *
 * Solo valida los nombres de rampa declarados en @theme (brand, accent,
 * tertiary...); las paletas que Tailwind trae de serie (red-500, gray-100) se
 * ignoran porque no dependen de nuestros tokens.
 */
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const THEME_CSS = join(SRC, 'styles', 'index.css');
const SCANNED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);

/** Declaracion: --color-<nombre>-<parada>. */
const DECLARATION_RE = /--color-([a-z][a-z0-9]*)-(\d{2,3})\s*:/g;

/**
 * Uso: `bg-accent-50`, `hover:text-brand-700`, `border-accent-300/45` o la
 * referencia directa `var(--color-tertiary-200)`. El prefijo de utilidad puede
 * tener varios segmentos (`from-`, `outline-`, `placeholder-`), de ahi el {1,3}.
 */
const USAGE_RE = /(?<![-\w])(?:--color-|(?:[a-z][a-z0-9]*-){1,3})([a-z][a-z0-9]*)-(\d{2,3})(?![-\w])/g;

/** Extrae el contenido del bloque @theme { ... } equilibrando llaves. */
const readThemeBlock = (css) => {
  const at = css.indexOf('@theme');
  if (at === -1) throw new Error(`No se encontro el bloque @theme en ${THEME_CSS}`);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('El bloque @theme no esta cerrado');
};

const collectFiles = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else if (SCANNED_EXT.has(extname(entry.name))) out.push(full);
  }
  return out;
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const run = async () => {
  const themeBlock = readThemeBlock(await readFile(THEME_CSS, 'utf8'));

  /** @type {Map<string, Set<string>>} nombre de rampa -> paradas declaradas. */
  const declared = new Map();
  for (const [, name, stop] of themeBlock.matchAll(DECLARATION_RE)) {
    if (!declared.has(name)) declared.set(name, new Set());
    declared.get(name).add(stop);
  }
  if (declared.size === 0) throw new Error('El bloque @theme no declara ninguna rampa --color-*-<parada>');

  const files = await collectFiles(SRC);
  const problems = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(USAGE_RE)) {
      const [, name, stop] = match;
      const stops = declared.get(name);
      // Nombre ajeno a nuestras rampas: lo resuelve el tema por defecto de Tailwind.
      if (!stops || stops.has(stop)) continue;
      problems.push({
        file: relative(ROOT, file).replace(/\\/g, '/'),
        line: lineOf(text, match.index),
        used: `${name}-${stop}`,
        available: [...stops].sort((a, b) => Number(a) - Number(b)).join(', '),
      });
    }
  }

  const ramps = [...declared.entries()]
    .map(([name, stops]) => `${name} (${stops.size})`)
    .join(', ');

  if (problems.length === 0) {
    console.log(`check-color-ramps: OK — ${files.length} archivos, rampas declaradas: ${ramps}.`);
    return;
  }

  console.error(`check-color-ramps: ${problems.length} uso(s) de una parada de rampa NO declarada en @theme.`);
  console.error('Tailwind no generara esas utilidades y el color no se pintara.\n');
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.used}  (declaradas: ${p.available})`);
  }
  console.error(`\nDeclara la parada en src/styles/index.css (@theme) o usa una existente.`);
  process.exitCode = 1;
};

run().catch((error) => {
  console.error(`check-color-ramps: ${error.message}`);
  process.exitCode = 1;
});
