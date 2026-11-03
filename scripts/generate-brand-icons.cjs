const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'frontend/public/favicon.svg'), 'utf8');
const assets = path.join(root, 'mobile/assets');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    async function capture(name, content, background = 'transparent', width = 1024) {
      await page.setContent(`<!doctype html><style>html,body{margin:0;width:1024px;height:1024px;background:${background}}body{display:grid;place-items:center}svg{width:${width}px;height:${width}px}</style>${content}`);
      await page.screenshot({ path: path.join(assets, name), omitBackground: background === 'transparent' });
    }
    await capture('icon.png', svg, '#602060');
    await capture('favicon.png', svg, '#602060');
    await capture('android-icon-foreground.png', svg, 'transparent', 600);
    await capture('android-icon-background.png', '', '#602060');
    const monochrome = svg.replace(/<rect[^>]*\/>/, '').replace(/fill="[^"]+"/g, 'fill="#ffffff"').replace(/stroke="[^"]+"/g, 'stroke="#ffffff"');
    await capture('android-icon-monochrome.png', monochrome, 'transparent', 600);
    await capture('splash-icon.png', svg, 'transparent', 540);
    const cakePage = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    for (const name of ['vanilla', 'custom', 'special']) {
      const cakeSvg = fs.readFileSync(path.join(root, 'frontend/public/images/cakes', `${name}.svg`), 'utf8');
      await cakePage.setContent(`<!doctype html><style>html,body{margin:0;width:960px;height:720px}svg{width:960px;height:720px}</style>${cakeSvg}`);
      await cakePage.screenshot({ path: path.join(root, 'frontend/public/images/cakes', `${name}.png`) });
    }
    await cakePage.close();
  } finally { await browser.close(); }
}
main().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
