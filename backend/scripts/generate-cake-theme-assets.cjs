const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const output = path.resolve(__dirname, '../../frontend/public/images/cake-themes');
const entries = [
  { slug: 'hombre-arana', name: 'Hombre Araña clásico', bg: '#edf1f5', cake: '#b95051', top: '#d76b68', trim: '#507491', art: '<g fill="none" stroke="#fff4e3" stroke-width="2" opacity=".8"><path d="M400 290v142m-170-92 340 42m-325 35 310-91m-264-23 215 142"/><path d="M350 310q35 5 68 0 27 32 20 58-40 20-69 0-16-28-19-58m-40-8q65 28 119-5 55 61 39 105-67 28-126-4-21-55-32-96m-30-7q71 54 168-2 67 86 52 130-105 39-171-8-31-66-49-120"/></g><g transform="translate(403 249)"><circle r="43" fill="#a73d42"/><ellipse rx="7" ry="12" fill="#273c4a"/><circle cy="-14" r="6" fill="#273c4a"/><path d="m-5-5-19-15m20 19-25 2m25 3-24 20m32-29 19-15m-20 19 25 2m-25 3 24 20" stroke="#273c4a" stroke-width="4" stroke-linecap="round"/></g>' },
  { slug: 'flores-delicadas', name: 'Flores delicadas', bg: '#f3e9e8', cake: '#f5e3ce', top: '#fff6e8', trim: '#c496a8', art: '<g fill="#81977b"><ellipse cx="293" cy="263" rx="30" ry="10" transform="rotate(-25 293 263)"/><ellipse cx="474" cy="266" rx="30" ry="10" transform="rotate(25 474 266)"/><ellipse cx="365" cy="246" rx="25" ry="10" transform="rotate(25 365 246)"/></g><g fill="#cc93a8" stroke="#e9bece" stroke-width="6"><circle cx="325" cy="258" r="28"/><circle cx="390" cy="244" r="26"/><circle cx="449" cy="265" r="28"/></g><g fill="none" stroke="#ac758c" stroke-width="3"><path d="M307 258q24-25 33-1 8 18-12 16-15-3-6-12m50-18q24-25 33-1 8 18-12 16-15-3-6-12m44 18q24-25 33-1 8 18-12 16-15-3-6-12"/></g>' },
  { slug: 'dinosaurio-3d', name: 'Dinosaurio en 3D', bg: '#e7eee6', cake: '#a4bc8c', top: '#d8e5bd', trim: '#66835c', art: '<path d="M330 260q-10-61 66-59l20-66q5-25 29-18 22 12 5 30l-17 12 10 75q45 10 79-15-6 48-70 37l-5 24h-22l-7-27h-40l-12 28h-25l4-21Z" fill="#65865b"/><circle cx="438" cy="132" r="3" fill="#314437"/><path d="m379 201 7-17 10 17m-32 5 3-17 14 14m22-21 12-10 5 15" fill="#d9ba6c"/><g fill="#d7bb71"><ellipse cx="293" cy="370" rx="15" ry="10"/><ellipse cx="479" cy="404" rx="19" ry="13"/><ellipse cx="539" cy="348" rx="13" ry="9"/></g>' },
  { slug: 'celebracion-dos-pisos', name: 'Celebración de dos pisos', bg: '#eeebdf', cake: '#eddfc8', top: '#fff8e9', trim: '#bb9a64', art: '<path d="M286 275h228v-87H286Z" fill="#fff1dc"/><ellipse cx="400" cy="274" rx="114" ry="27" fill="#f3dfbd"/><ellipse cx="400" cy="187" rx="114" ry="27" fill="#fff8e9"/><path d="M287 216q115 35 226 0v10q-112 34-226 0Z" fill="#c4a574"/><g fill="#c4a574"><circle cx="338" cy="171" r="6"/><circle cx="368" cy="165" r="6"/><circle cx="400" cy="164" r="6"/><circle cx="432" cy="165" r="6"/><circle cx="462" cy="171" r="6"/></g>' },
];
const svg = (entry) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${entry.bg}"/><stop offset="1" stop-color="#fffaf1"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="16"/></filter></defs><rect width="800" height="600" fill="url(#bg)"/><circle cx="735" cy="75" r="190" fill="#fffaf1" opacity=".6"/><ellipse cx="400" cy="494" rx="230" ry="28" fill="#344352" opacity=".15" filter="url(#s)"/><ellipse cx="400" cy="463" rx="272" ry="53" fill="#fffdf6"/><ellipse cx="400" cy="455" rx="228" ry="35" fill="none" stroke="#dfd7c9"/><path d="M213 306h374v128c0 60-374 60-374 0Z" fill="${entry.cake}"/><ellipse cx="400" cy="306" rx="187" ry="44" fill="${entry.top}"/><path d="M215 418q183 54 370 0v16q-185 60-370 0Z" fill="${entry.trim}"/>${entry.art}</svg>`;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    for (const entry of entries) {
      const art = svg(entry);
      fs.writeFileSync(path.join(output, entry.slug + '.svg'), art);
      await page.setContent(`<html><body style="margin:0">${art}</body></html>`);
      await page.screenshot({ path: path.join(output, entry.slug + '.png'), clip: { x: 0, y: 0, width: 800, height: 600 } });
    }
  } finally { await browser.close(); }
  console.log('4 ilustraciones referenciales preparadas para la galería');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
