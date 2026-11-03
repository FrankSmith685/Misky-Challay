/** Ilustraciones SVG locales: misma biblioteca visual que las tortas existentes. */
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../../frontend/public/images/pastry');
fs.mkdirSync(output, { recursive: true });
const scene = (title, art, background = '#f2e9df', accent = '#e2d0b9') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${title}">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#fffaf1"/></linearGradient><linearGradient id="choc" x2=".3" y2="1"><stop stop-color="#714535"/><stop offset="1" stop-color="#35241f"/></linearGradient><linearGradient id="cream" x2="0" y2="1"><stop stop-color="#fff8e7"/><stop offset="1" stop-color="#e9cfad"/></linearGradient><linearGradient id="gold" x2="0" y2="1"><stop stop-color="#e9b668"/><stop offset="1" stop-color="#b77937"/></linearGradient><filter id="shadow" x="-40%" y="-40%" width="180%" height="200%"><feGaussianBlur stdDeviation="14"/></filter><pattern id="crumb" width="23" height="19" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r="1.4" fill="#fff" opacity=".12"/><circle cx="16" cy="14" r="1" fill="#2e2119" opacity=".12"/></pattern></defs>
<rect width="800" height="600" fill="url(#bg)"/><circle cx="710" cy="50" r="210" fill="${accent}" opacity=".23"/><path d="M0 490C170 420 215 585 440 530S690 450 800 495V600H0Z" fill="${accent}" opacity=".2"/><ellipse cx="410" cy="482" rx="250" ry="34" fill="#493a33" opacity=".17" filter="url(#shadow)"/><ellipse cx="400" cy="453" rx="290" ry="62" fill="#fffdf8"/><ellipse cx="400" cy="448" rx="245" ry="44" fill="none" stroke="#e5dcd0" stroke-width="2"/>
${art}</svg>`;
const berry = (x, y, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-19-2Q-22 17 0 33Q24 14 19-2Q0-17-19-2" fill="#b94959"/><path d="m-17-7 12 1 5-12 5 12 13-1-10 11-8-5-8 5Z" fill="#547448"/><path d="m-9 6 1 4m14-7-1 4m-4 8v4m-5-6-1 3m13-2-1 3" stroke="#f7ddac" stroke-width="2" stroke-linecap="round"/></g>`;
const cake = (chocolate) => `<path d="M202 278h396v134c0 65-396 65-396 0Z" fill="${chocolate ? 'url(#choc)' : 'url(#cream)'}"/><ellipse cx="400" cy="278" rx="198" ry="49" fill="${chocolate ? '#80503c' : '#fff8e9'}"/><path d="M203 340c111 42 282 41 394 0v15c-111 42-283 41-394 0Z" fill="${chocolate ? '#bd916b' : '#c96671'}"/><path d="M203 376c111 42 282 41 394 0v16c-111 42-283 41-394 0Z" fill="${chocolate ? '#e8d0af' : '#fff9ec'}"/><path d="M203 283c91 39 304 40 394 0v30q-12 20-23-1-12-15-19 20-15 24-24-4-12-26-24-3-10 18-20-2-16-18-30 5-17 24-24-7-9-21-25 0-21 23-29-7-12-22-28 3-15 24-29-7-10-19-23 2-15 20-27-7-9-14-18 1v-26Z" fill="${chocolate ? '#4f2d24' : '#fffdf5'}"/>
${chocolate ? '<g fill="#3d241d"><path d="m302 240 24-43 21 42-22 20Z"/><path d="m395 231 23-40 23 41-24 17Z"/><path d="m483 245 25-43 20 40-24 22Z"/></g><g stroke="#b9895e" stroke-width="4" fill="none"><path d="M280 271q120 37 242-1"/><path d="M302 279q101 22 204-3"/></g>' : berry(297,245,1.1)+berry(371,228,1.05)+berry(454,232,1.12)+berry(523,253,.95)}<path d="M202 330h396v84c0 60-396 60-396 0Z" fill="url(#crumb)"/>`;
const fatia = (tiramisu) => `<path d="m227 320 170-125 207 124-170 143-207-65Z" fill="${tiramisu ? '#d1a777' : '#704230'}"/><path d="m227 320 207 66 170-67v96l-170 91-207-85Z" fill="${tiramisu ? 'url(#cream)' : 'url(#choc)'}"/><path d="m227 349 207 70 170-75v16l-170 79-207-73Z" fill="${tiramisu ? '#997050' : '#c28f6b'}"/><path d="m227 385 207 77 170-85v18l-170 87-207-79Z" fill="${tiramisu ? '#997050' : '#c28f6b'}"/><path d="m227 320 170-125 207 124-170 67Z" fill="${tiramisu ? '#76523c' : '#4d2c22'}"/><path d="m243 320 154-113 189 112-152 60Z" fill="url(#crumb)"/>${tiramisu ? '<g fill="#fff5df"><ellipse cx="378" cy="273" rx="22" ry="13"/><ellipse cx="421" cy="288" rx="22" ry="13"/><ellipse cx="465" cy="304" rx="22" ry="13"/></g><path d="m360 273 18-33 17 33m8 14 18-34 18 34m9 17 18-34 17 34" fill="#fff5df"/><g fill="#4a3024"><ellipse cx="480" cy="342" rx="11" ry="6" transform="rotate(-25 480 342)"/><ellipse cx="503" cy="331" rx="11" ry="6" transform="rotate(25 503 331)"/></g>' : berry(418,274,1.1)+'<path d="m457 255 36-41 16 51-39 9Z" fill="#43281f"/>'}`;
const nougat = (almond) => {
  let topping = '';
  for (let i = 0; i < 24; i++) {
    const x = 255 + (i % 8) * 40, y = 261 + Math.floor(i / 8) * 27;
    topping += almond ? `<ellipse cx="${x}" cy="${y}" rx="12" ry="6" transform="rotate(${i * 23} ${x} ${y})" fill="#b68247" stroke="#e3bb8a" stroke-width="2"/>` : `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 7 : 4}" fill="${['#df8f8a','#e3b33e','#f4ecdb','#7f9c8c'][i % 4]}"/>`;
  }
  return `<path d="m207 285 112-80 293 65-106 89Z" fill="${almond ? '#fff0d4' : '#c9924e'}"/><path d="m207 285 299 74 106-89v116l-106 91-299-88Z" fill="${almond ? '#ecdbb4' : 'url(#gold)'}"/>${!almond ? '<path d="m208 328 298 81 106-90v17l-106 91-298-82Z" fill="#784b28"/><path d="m208 367 298 84 106-90v14l-106 92-298-85Z" fill="#8f5b2d"/>' : '<path d="m242 341 25 21m47-3 25 21m47-2 25 19m47-1 24 19m35-45 23-15m17-24 22-14" stroke="#b38a57" stroke-width="9" stroke-linecap="round"/>'}<path d="m207 285 112-80 293 65-106 89Z" fill="url(#crumb)"/>${topping}`;
};
const bites = (truffle) => Array.from({ length: 6 }, (_, i) => {
  const x = 252 + (i % 3) * 142 + (i > 2 ? -12 : 18), y = 290 + Math.floor(i / 3) * 104;
  return truffle ? `<g transform="translate(${x} ${y})"><path d="m-51 19 9 34h82l10-34" fill="#c8ad94"/><ellipse cy="16" rx="55" ry="18" fill="#e0cdb5"/><circle cy="-8" r="45" fill="url(#choc)"/><circle cy="-8" r="44" fill="url(#crumb)"/><path d="m-25-26 10 12m7-20 8 13m16-4 10 9m-49 10 10 8m12-13 10 8m7 3 12 8m-28 3 10 10" stroke="#a97c55" stroke-width="4" stroke-linecap="round"/></g>` : `<g transform="translate(${x} ${y})"><ellipse cy="16" rx="57" ry="22" fill="#c49361"/><path d="M-55-4v22q55 27 110 0V-4Z" fill="#f0d4a6"/><ellipse cy="1" rx="56" ry="22" fill="#ab6b38"/><ellipse cy="-9" rx="58" ry="23" fill="#e8c895"/><ellipse cy="-13" rx="51" ry="18" fill="#f5e3c2"/><ellipse cy="-13" rx="48" ry="17" fill="url(#crumb)"/><path d="M-33-17q33-12 64 0" stroke="#fffaf0" stroke-width="5" opacity=".8" fill="none"/></g>`;
}).join('');
const cheesecake = `<path d="m223 331 210-160 176 183-174 112-212-57Z" fill="#f8dda2"/><path d="m223 331 212 62 174-39v94l-174 67-212-79Z" fill="url(#cream)"/><path d="m223 418 212 75 174-63v18l-174 67-212-79Z" fill="#b98e5d"/><path d="m223 331 210-160 176 183-174 39Z" fill="#e8ae3a"/><path d="m254 327 176-133 146 149-143 32Z" fill="#f6c763"/><g fill="#514333"><ellipse cx="419" cy="245" rx="4" ry="7" transform="rotate(35 419 245)"/><ellipse cx="445" cy="272" rx="4" ry="7"/><ellipse cx="386" cy="288" rx="4" ry="7" transform="rotate(-35 386 288)"/><ellipse cx="462" cy="310" rx="4" ry="7" transform="rotate(30 462 310)"/><ellipse cx="414" cy="330" rx="4" ry="7"/></g><path d="M443 203q32-48 73-20-36 40-73 20" fill="#65845b"/>`;
const brownies = [[245,285],[410,275],[325,390],[505,380]].map(([x,y],i) => `<g transform="translate(${x} ${y})"><path d="m-70-25 51-37 104 25-46 43Z" fill="#674232"/><path d="m-70-25 109 31 46-43v65L39 73-70 39Z" fill="url(#choc)"/><path d="m-70-25 109 31 46-43v65L39 73-70 39Z" fill="url(#crumb)"/><ellipse cx="0" cy="-26" rx="20" ry="9" transform="rotate(${i*30} 0 -26)" fill="#d3ac78"/><path d="M-17-27 17-25" stroke="#a27c4f" fill="none" stroke-width="2"/></g>`).join('');
const assets = [
  ['torta-chocolate','Torta de chocolate y fudge',cake(true),'#ece3dc','#b7c3bf'],
  ['torta-fresas','Torta de vainilla y fresas',cake(false),'#f3e4df','#dfb8aa'],
  ['fatia-tiramisu','Fatia de tiramisú',fatia(true),'#eee8df','#d3bfa5'],
  ['fatia-chocolate','Fatia de chocolate intenso',fatia(false),'#e9e0d8','#b4bcb1'],
  ['turron-dona-pepa','Turrón de Doña Pepa',nougat(false),'#f4ead8','#deb578'],
  ['turron-almendras','Turrón de almendras',nougat(true),'#e9e9da','#bbc6aa'],
  ['mini-alfajores','Mini alfajores de manjar',bites(false),'#f0e7df','#dfbda7'],
  ['trufas-cacao','Trufas de cacao',bites(true),'#e6e6df','#b5c1b2'],
  ['cheesecake-maracuya','Cheesecake de maracuyá sin azúcar',cheesecake,'#f4edda','#e2cb85'],
  ['brownie-almendras','Brownie de almendras sin azúcar',brownies,'#e9e2dc','#d5bfaa'],
];
for (const [slug, title, art, bg, accent] of assets) fs.writeFileSync(path.join(output, `${slug}.svg`), scene(title, art, bg, accent));
console.log(`${assets.length} ilustraciones guardadas en frontend/public/images/pastry`);
// La biblioteca existente recibe PNG/WebP/JPG; rasterizamos los SVG sin servicios externos.
async function renderPng() {
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    for (const [slug] of assets) {
      await page.setContent(`<html><body style="margin:0">${fs.readFileSync(path.join(output, `${slug}.svg`), 'utf8')}</body></html>`);
      await page.screenshot({ path: path.join(output, `${slug}.png`), clip: { x: 0, y: 0, width: 800, height: 600 } });
    }
  } finally { await browser.close(); }
  console.log('10 PNG preparados para la biblioteca de medios');
}
renderPng().catch((error) => { console.error(error.message); process.exitCode = 1; });
