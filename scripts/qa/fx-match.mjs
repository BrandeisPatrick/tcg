/**
 * Live-match FX QA — draft a roster, use Kelvin's Frost Grenade for real,
 * film the skill's FX, end the turn and film the rival's turn and the combat
 * choreographer. Frames land in OUT_DIR with a contact sheet.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/fx-match.mjs OUT_DIR [PORT] [desktop|mobile]
 */
import { launch, byText, byAria, byAriaStart } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The dev server's origin — the desktop app may assign a port other than 5173.
const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? './match-shots');
const PORT = Number(process.argv[3] ?? 9335);
const MODE = process.argv[4] ?? 'desktop';
mkdirSync(OUT, { recursive: true });
const W = MODE === 'mobile' ? 390 : 1440, H = MODE === 'mobile' ? 844 : 900;
const PREFS = ['Kelvin', 'Lady Geist', 'Mirage', 'Warden', 'Seven', 'Sinclair', 'Abrams', 'Paige'];

const b = await launch({ port: PORT, width: W, height: H, scale: MODE === 'mobile' ? 2 : 1 });
const log = (...a) => console.log(...a);
const shots = [];
const shoot = async (name) => { const f = join(OUT, `${String(shots.length).padStart(3, '0')}-${name}.png`); await b.shot(f); shots.push({ name, f }); return f; };

try {
  await b.navigate(`${DEV_URL}/?screen=match&vtclock=1`);
  await b.waitFor(`document.querySelector('[aria-label^="Select "]')`, { timeout: 20000 });
  // ---- Draft: pick preferred heroes whenever the Lock button is live; tick for the AI in between.
  for (let i = 0; i < 60; i++) {
    const state = await b.evaluate(`(() => {
      const lock = ${byText('Lock')};
      const draftOpen = !!document.querySelector('[aria-label^="Select "]') || !!lock;
      const mulligan = ${byTextStartExpr('Lock In')};
      return { draftOpen, lockLive: !!lock && !lock.disabled, mulligan: !!mulligan };
    })()`);
    if (state.mulligan) break;
    if (!state.draftOpen) { await b.tick(300); await b.settle(2); const board = await b.evaluate(`!!${byAria('End Turn')}`); if (board) break; continue; }
    if (state.lockLive) {
      let picked = null;
      for (const name of PREFS) {
        const ok = await b.evaluate(`!!${byAria('Select ' + name)}`);
        if (ok) { await b.clickEl(byAria('Select ' + name), { js: true, scroll: false }); picked = name; break; }
      }
      await b.settle(3);
      await b.clickEl(byText('Lock'), { js: true, scroll: false });
      await b.settle(3);
      log('picked', picked);
    }
    await b.tick(400);
    await b.settle(2);
  }
  if (await b.evaluate(`!!${byTextStartExpr('Lock In')}`)) {
    await shoot('mulligan');
    await b.clickEl(byTextStartExpr('Lock In'), { js: true, scroll: false });
    await b.settle(3);
  }
  await b.waitFor(byAria('End Turn'), { timeout: 8000 });
  await b.tick(600);
  await b.settle(2);
  await shoot('turn1-board');

  // ---- Use Kelvin's skill on the rival active.
  const kelvin = byAriaStart('Kelvin —');
  const r1 = await b.clickEl(kelvin);
  log('kelvin slot click', r1.hit);
  await b.settle(3); await b.tick(300); await b.settle(2);
  await b.waitFor(`document.querySelector('[aria-label="Hero sheet"]')`, { timeout: 4000 });
  await shoot('hero-sheet');
  // The skill card: the element inside the sheet whose text starts with the ability name.
  const skillFinder = `(() => { const sheet = document.querySelector('[aria-label="Hero sheet"]'); const els = [...sheet.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Frost Grenade/.test(e.textContent)); return els[0]?.closest('[style*="cursor: pointer"]') ?? els[0]; })()`;
  const r2 = await b.clickEl(skillFinder);
  log('skill card click', r2.hit);
  await b.settle(3);
  // The sheet's exit fade starts late under the virtual clock — wait it out.
  for (let i = 0; i < 20; i++) { await b.tick(150); await b.settle(2); if (!(await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"]')`))) break; }
  await shoot('targeting');
  // Rival active = the hero slot button in the lane row with the smaller x (left).
  const target = `(() => { const btns = [...document.querySelectorAll('button[aria-label*=" — "]')]; const rs = btns.map((el) => ({ el, r: el.getBoundingClientRect() })); const ys = [...new Set(rs.map((x) => Math.round(x.r.top / 10)))].sort((a, b) => a - b); const laneY = ys[1]; const lane = rs.filter((x) => Math.round(x.r.top / 10) === laneY).sort((a, b) => a.r.left - b.r.left); return lane[0]?.el; })()`;
  const r3 = await b.clickEl(target);
  log('target click', r3.hit);
  await b.settle(4);
  const used = await b.evaluate(`[...document.querySelectorAll('*')].some((e) => e.children.length === 0 && /used skill/.test(e.textContent))`);
  log('skill fired:', used);
  // Film the skill: frames every 150ms for 2.4s.
  for (let t = 0; t <= 2400; t += 150) { if (t) await b.tick(150); await b.settle(1); await shoot(`skill-${t}`); }
  // ---- End turn, then film the rival's turn and the combat that follows.
  await b.tick(1500); await b.settle(2);
  const r4 = await b.clickEl(byAria('End Turn'), { js: true, scroll: false });
  log('end turn');
  let vt = 0, taken = 0, lastMarker = '';
  while (vt < 24000 && taken < 40) {
    await b.tick(250); vt += 250; await b.settle(1);
    const st = await b.evaluate(`(() => ({ fx: [...document.querySelectorAll('[data-fx-batch]')].map((e) => e.getAttribute('data-fx-batch')).join(','), skip: !!${byTextStartExpr('Skip')}, action: !!document.querySelector('[style*="z-index: 72"]') }))()`);
    const interesting = st.fx || st.skip;
    if (interesting) { await shoot(`rival-${vt}${st.skip ? '-combat' : ''}${st.fx ? '-fx' + st.fx : ''}`); taken++; }
    if (st.fx !== lastMarker) { log('t=' + vt, 'fx batches:', st.fx || '-', 'combat:', st.skip); lastMarker = st.fx; }
  }
  await shoot('after');
  // ---- Contact sheets, 5 per row.
  const rows = [];
  for (let i = 0; i < shots.length; i += 5) rows.push(shots.slice(i, i + 5));
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#eee;font:11px -apple-system,sans-serif}.row{display:flex;gap:6px;padding:6px}.c{width:${MODE === 'mobile' ? 200 : 280}px}img{width:100%;display:block;border:1px solid #333}.t{color:#aaa;text-align:center;padding:2px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>${rows.map((r) => `<div class="row">${r.map((s) => `<div class="c"><img src="file://${s.f}"><div class="t">${s.name}</div></div>`).join('')}</div>`).join('')}`;
  const file = join(OUT, 'sheet.html');
  writeFileSync(file, html);
  await b.navigate(`file://${file}`);
  await new Promise((r) => setTimeout(r, 500));
  const h = await b.evaluate('document.body.scrollHeight');
  const pages = Math.ceil(h / 2400);
  for (let p = 0; p < pages; p++) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
    await b.evaluate(`window.scrollTo(0, ${p * 2400})`);
    await new Promise((r) => setTimeout(r, 200));
    await b.shot(join(OUT, `sheet-${p}.png`), { x: 0, y: p * 2400, width: 1440, height: Math.min(2400, h - p * 2400) });
    log('sheet', join(OUT, `sheet-${p}.png`));
  }
  log('page errors:', b.errors.length ? b.errors.slice(0, 12) : 'none');
} catch (e) {
  console.error('FAILED', e);
  await shoot('failure').catch(() => {});
} finally {
  await b.close();
}

function byTextStartExpr(text) {
  return `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`;
}
