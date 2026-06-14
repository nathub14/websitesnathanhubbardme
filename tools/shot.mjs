// Quick visual check of the gallery. Run with: npx playwright@1.60 -y; node tools/shot.mjs
// (uses Edge + ANGLE/d3d11 — chromium can be flaky with GPU on this machine)
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

await page.goto(pathToFileURL(process.cwd() + '/index.html').href);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shot-intro.png' });

for (const id of ['ocean', 'train', 'vela', 'contact']) {
  await page.evaluate(s => document.getElementById(s).scrollIntoView(), id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `shot-${id}.png` });
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
