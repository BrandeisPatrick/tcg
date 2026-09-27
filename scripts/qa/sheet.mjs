// Build big contact sheets from a directory of NNN-name.png frames:
//   node scripts/qa/sheet.mjs DIR COLS WIDTH [PORT] [filter-substring]
import { launch } from './cdp.mjs';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const DIR = resolve(process.argv[2]);
const COLS = Number(process.argv[3] ?? 3);
const W = Number(process.argv[4] ?? 470);
const PORT = Number(process.argv[5] ?? 9350);
const FILTER = process.argv[6] ?? '';
const files = readdirSync(DIR).filter((f) => /^\d{3}-.*\.png$/.test(f) && f.includes(FILTER)).sort();
const rows = [];
for (let i = 0; i < files.length; i += COLS) rows.push(files.slice(i, i + COLS));
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#eee;font:11px -apple-system,sans-serif}.row{display:flex;gap:6px;padding:6px}.c{width:${W}px}img{width:100%;display:block;border:1px solid #333}.t{color:#aaa;text-align:center;padding:2px 0 4px}</style>${rows.map((r) => `<div class="row">${r.map((f) => `<div class="c"><img src="file://${join(DIR, f)}"><div class="t">${f}</div></div>`).join('')}</div>`).join('')}`;
const file = join(DIR, `big-${FILTER || 'all'}.html`);
writeFileSync(file, html);
const b = await launch({ port: PORT, width: 1440, height: 900 });
try {
  await b.navigate(`file://${file}`);
  await new Promise((r) => setTimeout(r, 600));
  const h = await b.evaluate('document.body.scrollHeight');
  const PAGE = 2200;
  for (let p = 0; p * PAGE < h; p++) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: PAGE, deviceScaleFactor: 1, mobile: false });
    await b.evaluate(`window.scrollTo(0, ${p * PAGE})`);
    await new Promise((r) => setTimeout(r, 200));
    const out = join(DIR, `big-${FILTER || 'all'}-${p}.png`);
    await b.shot(out, { x: 0, y: p * PAGE, width: 1440, height: Math.min(PAGE, h - p * PAGE) });
    console.log(out);
  }
} finally { await b.close(); }
