/**
 * Gallery FX showroom QA — click every demo on the Gallery's Combat FX tab,
 * sample the stage at four virtual-time offsets after the click, and build
 * contact sheets (4 demos × 4 frames each) to eyeball.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/fx-gallery.mjs OUT_DIR [PORT] ["Demo label|Other label"]
 *   SHEETS_ONLY=1 node scripts/qa/fx-gallery.mjs OUT_DIR   # rebuild sheets from frames
 *   OFFSETS=80,160,240,320,480,640 node scripts/qa/fx-gallery.mjs OUT_DIR   # finer sampling
 *
 * Any showroom button counts as a "demo": list "Calm motion: off" first to
 * film the demos after it under reduced motion.
 */
import { launch, byText } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The dev server's origin — the desktop app may assign a port other than 5173.
const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? './fx-shots');
const SHEETS_ONLY = process.env.SHEETS_ONLY === '1';
const PORT = Number(process.argv[3] ?? 9333);
const DEMOS = (process.argv[4] ?? '').split('|').filter(Boolean);
const OFFSETS = (process.env.OFFSETS ?? '150,450,800,1250,1800').split(',').map(Number);
const FRAME_W = Math.min(300, Math.floor(1230 / OFFSETS.length));
mkdirSync(OUT, { recursive: true });

const DEFAULT_DEMOS = [
  'Attack · Kelvin → Abrams', 'Attack · lethal — Abrams breaks', 'Attack · Shield blocks it',
  'Kelvin · Frost Grenade → Abrams', 'Lady Geist · Life Drain → Abrams', 'Spell · Cold Front → Abrams', 'Ult · Seismic Impact — spirit AoE + Stun',
  'Ult · Bullet Dance — gunfire AoE', 'Gunfire ×5', 'Two spirit hits on Abrams (2 + 3)', 'Pure hit ×2',
  'KO · gunfire', "Djinn's Mark ×4 detonates (Mirage → Abrams)", 'Bleed tick ×3 (Abrams) + ×2 (Haze)', 'Mystic Reverb echo (Abrams)',
  'Naptime — wakes (Abrams)', 'Charged → Discharge · Stun (Kelvin)', 'Killing Blow — execute (Abrams)', 'Ricochet → bench (Haze, Seven)',
  'Tesla chain → Haze', 'Storm Cloud pulse (Seven → all)', 'Heal 3 (Kelvin)', 'Shield absorbs 2, 1 spills',
  'Unstoppable — immune to damage', 'Three at once (Stun + Bleed + −BP)', 'KO Haze, then respawn her', 'Level up → 2 (Kelvin)',
];
const demos = DEMOS.length ? DEMOS : DEFAULT_DEMOS;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const b = await launch({ port: PORT, width: 1440, height: 900 });
try {
  if (!SHEETS_ONLY) {
  await b.navigate(`${DEV_URL}/?preview=1&tab=combat&vtclock=1`);
  await b.waitFor(byText('Kelvin · Frost Grenade → Abrams'));
  }
  // Stage clip: union of the six hero slots plus a margin for spill-over.
  const stage = async () => b.evaluate(`(() => {
    const slots = [...document.querySelectorAll('button[aria-label*=" — "]')].slice(0, 6);
    slots[0].scrollIntoView({ block: 'start' }); window.scrollBy(0, -100);
    const rs = slots.map((s) => s.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left)) - 70, top = Math.min(...rs.map((r) => r.top)) - 90;
    const right = Math.max(...rs.map((r) => r.right)) + 70, bottom = Math.max(...rs.map((r) => r.bottom)) + 40;
    const L = Math.max(0, left), T = Math.max(0, top);
    // CDP screenshot clips are in document coordinates.
    return { x: L + window.scrollX, y: T + window.scrollY, width: right - L, height: bottom - T };
  })()`);
  let clip = SHEETS_ONLY ? null : await stage();
  console.log('stage clip', JSON.stringify(clip));
  const sheets = [];
  let frames = [];
  for (const label of demos) {
    if (SHEETS_ONLY) { frames.push({ label, row: OFFSETS.map((off) => join(OUT, `${slug(label)}-${off}.png`)) }); if (frames.length === 4) { sheets.push(frames); frames = []; } continue; }
    // Reset between demos so KOs / HP from one don't bleed into the next.
    await b.clickEl(byText('Reset stage'), { js: true, scroll: false });
    await b.settle();
    await b.tick(1500);
    clip = await stage();
    const r = await b.clickEl(byText(label), { js: true, scroll: false });
    r.hit = 'JS';
    await b.settle(4);
    let t = 0;
    const row = [];
    for (const off of OFFSETS) {
      await b.tick(off - t); t = off;
      await b.settle(2);
      const f = join(OUT, `${slug(label)}-${off}.png`);
      await b.shot(f, clip);
      row.push(f);
    }
    // Let the batch finish before the next one.
    await b.tick(3000);
    const marker = await b.evaluate(`document.querySelectorAll('[data-fx-batch]').length`);
    console.log(`${label}  click=${r.hit}  leftover-batches=${marker}`);
    frames.push({ label, row });
    if (frames.length === 4) { sheets.push(frames); frames = []; }
  }
  if (frames.length) sheets.push(frames);
  // Contact sheets.
  let i = 0;
  for (const group of sheets) {
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#111;color:#eee;font:12px/1.3 -apple-system,sans-serif}
      .row{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-bottom:1px solid #333}
      .label{width:150px;flex:0 0 150px;padding-top:4px;font-weight:600}
      img{width:${FRAME_W}px;height:auto;display:block;border:1px solid #333}
      .t{color:#999;font-size:10px;text-align:center}
    </style>${group.map((g) => `<div class="row"><div class="label">${g.label}</div>${g.row.map((f, k) => `<div><img src="file://${f}"><div class="t">${OFFSETS[k]} ms</div></div>`).join('')}</div>`).join('')}`;
    const file = join(OUT, `sheet-${i}.html`);
    writeFileSync(file, html);
    await b.navigate(`file://${file}`);
    await new Promise((r) => setTimeout(r, 400));
    const h = await b.evaluate('document.body.scrollHeight');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: Math.min(h, 3000), deviceScaleFactor: 1, mobile: false });
    await b.shot(join(OUT, `sheet-${i}.png`));
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    console.log('sheet', join(OUT, `sheet-${i}.png`));
    i++;
  }
  console.log('page errors:', b.errors.length ? b.errors : 'none');
} finally {
  await b.close();
}
