// Screenshot tool: captures the running site at several points along the walk.
// Usage: node tools/shot.mjs [t-values...] e.g. node tools/shot.mjs 0 0.3 0.7
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:5179';
const ts = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
const points = ts.length ? ts : [0.02, 0.35, 0.7];

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(3800); // let boot overlay clear & scene settle

for (const t of points) {
  await page.evaluate((tt) => window.__vela?.jump(tt), t);
  await page.waitForTimeout(900);
  const name = `shots/walk-${String(t).replace('.', '_')}.png`;
  await page.screenshot({ path: name });
  console.log('saved', name);
}

// rough FPS measure
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res((n / 2).toFixed(0)); };
  requestAnimationFrame(loop);
}));
console.log('FPS ~', fps);

if (errors.length) {
  console.log('\n--- console errors ---');
  errors.slice(0, 20).forEach(e => console.log(e));
}
await browser.close();
