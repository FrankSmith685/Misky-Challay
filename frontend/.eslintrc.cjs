/*
 * El radio del producto es un TOKEN, no un numero. El editor de tema publica
 * --radius-card/field/pill en :root (theme/applyCssVars.ts), asi que un 5px
 * escrito a mano es la unica forma de quedarse fuera del sistema: el dia que el
 * negocio baje el radio, ese componente se queda rectangular a 5px para siempre.
 * De ahi que la prohibicion sea de lint y no una nota en el README.
 */
const RADIUS_TOKEN_HINT =
  'superficies -> card (tarjetas, paneles, secciones, modales, mosaicos de icono), controles -> field (botones, inputs, filas de menu, steppers), etiquetas -> pill (badges, chips, tags, barras de progreso)';

const NO_LITERAL_RADIUS = [
  {
    // Clases Tailwind sueltas: className="... rounded-[5px] ..."
    selector: 'Literal[value=/rounded-\\[5px\\]/]',
    message: `Radio literal: usa rounded-card, rounded-field o rounded-pill (${RADIUS_TOKEN_HINT}). Los tres valen 5px hoy, asi que el cambio no altera el pixel.`,
  },
  {
    // Lo mismo dentro de plantillas: cn(`... rounded-[5px] ...`)
    selector: 'TemplateElement[value.raw=/rounded-\\[5px\\]/]',
    message: `Radio literal: usa rounded-card, rounded-field o rounded-pill (${RADIUS_TOKEN_HINT}). Los tres valen 5px hoy, asi que el cambio no altera el pixel.`,
  },
  {
    // sx de MUI, con la clave entrecomillada o sin ella.
    selector:
      "Property[key.name='borderRadius'][value.value='5px'], Property[key.value='borderRadius'][value.value='5px']",
    message: `Radio literal en sx: usa borderRadius: 'var(--radius-card)', 'var(--radius-field)' o 'var(--radius-pill)' (${RADIUS_TOKEN_HINT}).`,
  },
];

module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-restricted-syntax': ['error', ...NO_LITERAL_RADIUS],
  },
  overrides: [
    {
      // Ampliar el tipo de una libreria (theme/mui.d.ts anade las paradas de rampa
      // a PaletteColor de MUI) solo se puede con `interface X extends Y {}`: la
      // interfaz parece vacia pero la augmentacion si aporta miembros, asi que la
      // regla da un falso positivo. Se permite unicamente donde vive ese patron;
      // una interfaz vacia de verdad (`interface X {}`) sigue siendo error.
      files: ['src/**/*.d.ts'],
      rules: {
        '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
      },
    },
  ],
};
