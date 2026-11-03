/** Genera miniaturas ilustrativas para la biblioteca de insumos de tortas. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { supplies } = require('./cake-supply-catalog.cjs');

const targetDir = path.resolve(__dirname, '../frontend/public/images/ingredients');
const palette = [
  ['#e8f3ed', '#2f6f5e', '#f6c453'],
  ['#fff0e9', '#b85c38', '#f08b59'],
  ['#f2ecff', '#7251a2', '#c3a7eb'],
  ['#fff8df', '#b27a1c', '#f5c95b'],
  ['#e9f3fb', '#316b9e', '#8fc9ed'],
  ['#fcebf2', '#a84469', '#ee9ab7'],
];

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

const kindFor = (supply) => {
  if (supply.unit === 'und') return 'EMPAQUE';
  if (/MANJAR|FUDGE|FROSTING|GANACHE|MERMELADA|NUTELLA/.test(supply.code)) return 'RELLENO';
  if (/BUTTERCREAM|FONDANT|COLORANTE/.test(supply.code)) return 'DECORACIÓN';
  return 'REPOSTERÍA';
};

const svgFor = (supply, index) => {
  const [background, accent, highlight] = palette[index % palette.length];
  const kind = kindFor(supply);
  const words = supply.name.split(/\s+/).slice(0, 3);
  const label = words.map(escapeXml).join(' ');
  const initials = supply.name.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260" viewBox="0 0 360 260">
  <rect width="360" height="260" rx="24" fill="${background}"/>
  <rect x="0" y="0" width="360" height="54" rx="24" fill="${accent}"/>
  <rect x="0" y="30" width="360" height="24" fill="${accent}"/>
  <text x="24" y="35" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="1.3">${kind}</text>
  <ellipse cx="180" cy="151" rx="82" ry="22" fill="#d6c5b7" opacity=".55"/>
  <path d="M107 127h146l-11 55c-4 20-25 31-62 31s-58-11-62-31z" fill="#ffffff" stroke="${accent}" stroke-width="4"/>
  <path d="M112 128c9-27 37-43 68-43s59 16 68 43c-12 15-32 23-68 23s-56-8-68-23z" fill="${highlight}" stroke="${accent}" stroke-width="4"/>
  <path d="M132 117c18-18 37-24 48-24 14 0 35 8 48 25" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity=".7"/>
  <circle cx="180" cy="126" r="26" fill="${accent}" opacity=".16"/>
  <text x="180" y="143" text-anchor="middle" fill="${accent}" font-family="Arial, sans-serif" font-size="25" font-weight="800">${escapeXml(initials)}</text>
  <text x="180" y="232" text-anchor="middle" fill="#183b36" font-family="Arial, sans-serif" font-size="16" font-weight="700">${label}</text>
  </svg>`;
};

(async () => {
  fs.mkdirSync(targetDir, { recursive: true });
  const executablePath = process.env.CAKE_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 360, height: 260 }, deviceScaleFactor: 1 });
  try {
    for (const [index, supply] of supplies.entries()) {
      await page.setContent(svgFor(supply, index), { waitUntil: 'load' });
      await page.screenshot({ path: path.join(targetDir, supply.image), type: 'png' });
    }
  } finally {
    await browser.close();
  }
  console.log(`Generadas ${supplies.length} imágenes en ${targetDir}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
