/**
 * Story-map playtest — plays the campaign screen with real clicks, drags and
 * wheel turns, and checks what the map promises: a run starts from the intro,
 * a stop selects before it acts, the frontier opens in view and clear of the
 * docks, every stop sits exactly on its map point at any zoom, the wheel
 * zooms about the cursor, the sheet never shows its edge, the picks clear
 * their stops, the run panel flies to a stop, and a run can be abandoned.
 * Prints PASS / FAIL per check, saves NNN-size-name.png frames, and exits
 * non-zero on any failure.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/story.mjs OUT_DIR [PORT] [desktop|mobile]
 *
 * Real clock throughout (no vtclock): the camera's flights and the raster
 * commit are rAF/timer driven, so each step sleeps a little real time.
 */
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const URL = `${DEV_URL}/?screen=story`;
const OUT = resolve(process.argv[2] ?? './story-shots');
const PORT = Number(process.argv[3] ?? 9431);
const MODE = process.argv[4] ?? 'desktop';
mkdirSync(OUT, { recursive: true });
const PHONE = MODE === 'mobile';
const W = PHONE ? 390 : 1440, H = PHONE ? 844 : 900;
const KEY = 'deadlock-tcg-story';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await launch({ port: PORT, width: W, height: H, scale: PHONE ? 2 : 1 });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
let frame = 0;
const shot = async (name) => {
  await sleep(250);
  await b.shot(join(OUT, `${String(++frame).padStart(3, '0')}-${MODE}-${name}.png`));
};

// ---- page probes ---------------------------------------------------------------
const stopEl = (id) => `document.querySelector('[data-stop="${id}"]')`;
const button = (prefix) => `[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()).toLowerCase().startsWith(${JSON.stringify(prefix.toLowerCase())}))`;
/** A button inside the dialog with this aria-label (the map's own buttons
 *  stay in the DOM behind a pick sheet). */
const inDialog = (dialog, prefix) => `[...document.querySelectorAll('[role="dialog"][aria-label=${JSON.stringify(dialog)}] button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(prefix)}))`;
const readRun = () => b.evaluate(`JSON.parse(localStorage.getItem('${KEY}'))`);
const writeRun = (run) => b.evaluate(`localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(run))})`);
/** Every stop marker: id, state (from its label), and its centre. */
const STOPS = `[...document.querySelectorAll('[data-stop]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.stop, label: el.getAttribute('aria-label'), state: el.getAttribute('aria-label').split(' — ')[2],
    pressed: el.getAttribute('aria-pressed') === 'true', x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`;
const DOCKS = `[...document.querySelectorAll('[data-dock]')].map((el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })`;
/** The worst distance between a marker's centre and its map point, where the
 *  map point goes through the map SVG's own screen matrix. */
const ALIGN = `(() => {
  const svg = document.querySelector('[data-map-layer] svg');
  const m = svg.getScreenCTM();
  const run = JSON.parse(localStorage.getItem('${KEY}'));
  let worst = 0, at = '';
  for (const n of run.nodes) {
    const el = document.querySelector('[data-stop="' + n.id + '"]');
    const r = el.getBoundingClientRect();
    const p = new DOMPoint(n.x * 840, n.y * 1080).matrixTransform(m);
    const d = Math.hypot(r.left + r.width / 2 - p.x, r.top + r.height / 2 - p.y);
    if (d > worst) { worst = d; at = n.id; }
  }
  return { worst, at, s: m.a };
})()`;
/** Live zoom (px per map unit) as the SVG reports it, and the layer's state. */
const LAYER = `(() => {
  const layer = document.querySelector('[data-map-layer]');
  const m = layer.querySelector('svg').getScreenCTM();
  return { s: m.a, band: layer.dataset.zoom, transform: layer.style.transform };
})()`;
const band = (s) => (s >= 3.6 ? 'near' : s >= 2.4 ? 'mid' : 'far');
const inDock = (p, docks) => docks.some((d) => p.x >= d.x0 && p.x <= d.x1 && p.y >= d.y0 && p.y <= d.y1);
const onScreen = (p) => p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;

async function drag(x0, y0, x1, y1, steps = 14) {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, button: 'left', buttons: 1 });
  }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1 });
}
/** The map layer's transform — the camera, as the page applied it. */
const layerTransform = () => b.evaluate(`document.querySelector('[data-map-layer]').style.transform`);
/** A point in the given part of the screen where a press lands on the map
 *  (bare sheet, a stop or a tag) and not on the HUD. */
const mapPointIn = (fx0, fx1, fy0, fy1) => b.evaluate(`(() => {
  for (let y = ${H} * ${fy0}; y < ${H} * ${fy1}; y += 17) for (let x = ${W} * ${fx0}; x < ${W} * ${fx1}; x += 13) {
    const el = document.elementFromPoint(x, y);
    if (el && (el.closest('[data-map-layer]') || el.closest('[data-stop]'))) return { x, y };
  }
  return null;
})()`);
/** Pan as far as the sheet goes in a direction (dx, dy ∈ -1..1 — the way the
 *  finger moves), in strokes that stay inside the window: Chrome drops mouse
 *  events outside it, so one long drag off screen moves nothing. Returns how
 *  many strokes moved the map. */
async function panToEdge(dx, dy) {
  let moved = 0;
  for (let i = 0; i < 14; i++) {
    const before = await layerTransform();
    // Start on the side the finger moves away from, end well inside the far side.
    const fx = dx > 0 ? [0.08, 0.3] : dx < 0 ? [0.7, 0.92] : [0.35, 0.65];
    const fy = dy > 0 ? [0.12, 0.3] : dy < 0 ? [0.6, 0.78] : [0.35, 0.6];
    const p = await mapPointIn(fx[0], fx[1], fy[0], fy[1]);
    if (!p) break;
    const to = { x: Math.min(W - 2, Math.max(2, p.x + dx * W * 0.6)), y: Math.min(H - 2, Math.max(2, p.y + dy * H * 0.4)) };
    await drag(p.x, p.y, to.x, to.y, 10);
    await sleep(60);
    if ((await layerTransform()) === before) break;
    moved++;
  }
  await sleep(450);
  return moved;
}
/** A point on bare map — no stop, dock or control under it. */
const bareMap = () => b.evaluate(`(() => {
  for (let y = ${H} * 0.3; y < ${H} * 0.8; y += 23) for (let x = ${W} * 0.3; x < ${W} * 0.9; x += 19) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest('[data-map-layer]')) return { x, y };
  }
  return null;
})()`);
/** Wait until the camera has come to rest: the sheet laid out at the zoom
 *  (scale exactly 1) and the transform unchanged for a beat. */
async function waitRest(timeout = 3000) {
  const t0 = Date.now();
  let prev = null;
  while (Date.now() - t0 < timeout) {
    const t = await layerTransform();
    if (/ scale\(1\)$/.test(t) && t === prev) return true;
    prev = t;
    await sleep(120);
  }
  return false;
}
async function zoomButton(label, times = 1) {
  for (let i = 0; i < times; i++) {
    await b.evaluate(`document.querySelector('[aria-label="${label}"]')?.click()`);
    await sleep(380);
  }
  await sleep(300); // flight done + raster commit
}
async function toMap() {
  await b.navigate(URL);
  await b.waitFor(`document.querySelector('[data-map-layer]')`, { timeout: 15000 });
  await sleep(1300);
}

try {
  // ---- 1. fresh save → intro → Enter the city → pick the 2nd hero ----------------
  await b.navigate(URL);
  await b.evaluate(`localStorage.removeItem('${KEY}')`);
  await b.navigate(URL);
  await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Streets of New York"]')`);
  await sleep(700);
  await shot('intro');
  check('1a intro sheet on a fresh save', true);
  await b.clickEl(button('Enter the city'));
  await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Choose your first hero"] [data-pick="1"]')`);
  await sleep(900);
  await shot('pick-start');
  await b.clickEl(`document.querySelector('[data-pick="1"]')`);
  await sleep(300);
  const chosenName = await b.evaluate(`document.querySelector('[data-pick="1"]').getAttribute('aria-label').replace(/ \\(2\\).*$/, '')`);
  await b.clickEl(inDialog('Choose your first hero', 'Start with '));
  await b.waitFor(`document.querySelectorAll('[data-stop]').length === 21`);
  await sleep(1300);
  await shot('map-fresh');
  let run = await readRun();
  const heroName = run && await b.evaluate(`import('/src/cards/index.ts').then((m) => m.CARDS_BY_ID[${JSON.stringify(run.heroes[0])}].name)`);
  check('1b run starts with the 2nd hero offered', run?.heroes.length === 1 && heroName === chosenName, `${heroName} vs ${chosenName}`);
  let stops = await b.evaluate(STOPS);
  const open1 = stops.filter((s) => s.state === 'open').map((s) => s.id);
  check('1c 21 stops, only Battery Park open', stops.length === 21 && open1.length === 1 && open1[0] === 'battery', `${stops.length} stops, open: ${open1.join(',')}`);
  const bat = stops.find((s) => s.id === 'battery');
  check('1d Battery Park in view, clear of the docks', onScreen(bat) && !inDock(bat, await b.evaluate(DOCKS)), `${Math.round(bat.x)},${Math.round(bat.y)}`);

  // ---- 2. press Battery → card → Fight → board; back again, run intact ----------
  const hit = await b.clickEl(stopEl('battery'));
  await sleep(500);
  const card = await b.evaluate(`!!document.querySelector('[aria-label="Battery Park, Battle"]') && !!document.querySelector('[aria-label="Fight at Battery Park"]')`);
  const stillMap = await b.evaluate(`!!document.querySelector('[data-map-layer]')`);
  check('2a pressing a stop selects it (card names it, offers Fight; nothing launches)', hit.hit === 'HIT' && card && stillMap, hit.hit);
  await shot('stopcard-battery');
  await b.clickEl(button('Fight at Battery Park'));
  const board = await b.waitFor(`!document.querySelector('[data-map-layer]') && (document.querySelector('[aria-label="End Turn"]') || [...document.querySelectorAll('button')].some((x) => /^Lock/.test(x.textContent.trim())))`, { timeout: 20000 }).catch(() => false);
  await sleep(800);
  await shot('match');
  check('2b Fight opens the match board', board);
  const before = run;
  await toMap();
  run = await readRun();
  check('2c back via ?screen=story, the run is intact', JSON.stringify(run) === JSON.stringify(before));

  // ---- 2d. a won battle: the stop stamps, the camera lands there, then flies on -
  await b.clickEl(stopEl('battery'));
  await sleep(400);
  await b.clickEl(button('Fight at Battery Park'));
  await b.waitFor(`!document.querySelector('[data-map-layer]')`, { timeout: 20000 });
  await sleep(1500);
  // What the board does on a win. Import the module instance the app holds —
  // after an HMR update its URL carries a ?t= stamp, and a bare import would
  // load a second copy with no exit handler registered.
  await b.evaluate(`(() => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/story/storyRun.ts')) ?? '/src/story/storyRun.ts';
    return import(url).then((m) => m.finishStoryBattle(true));
  })()`);
  await b.waitFor(`document.querySelector('[data-stop="battery"]')`, { timeout: 15000 });
  await sleep(380);
  const landing = await b.evaluate(STOPS);
  await shot('arrival-stamp');
  await sleep(1700);
  await shot('arrival-frontier');
  stops = await b.evaluate(STOPS);
  const docks2 = await b.evaluate(DOCKS);
  const open2 = stops.filter((s) => s.state === 'open');
  const batL = landing.find((s) => s.id === 'battery');
  check('2d a won battle clears the stop and opens its three legs', stops.find((s) => s.id === 'battery').state === 'cleared' && open2.length === 3, open2.map((s) => s.id).join(','));
  check('2e the arrival opens on the stamped stop, then frames the new frontier',
    Math.hypot(batL.x - W / 2, batL.y - H / 2) < Math.max(W, H) * 0.35 && open2.every((s) => onScreen(s) && !inDock(s, docks2)),
    `landed ${Math.round(batL.x)},${Math.round(batL.y)}; open ${open2.map((s) => `${s.id}@${Math.round(s.x)},${Math.round(s.y)}`).join(' ')}`);

  // ---- 3. doctored mid-run: the frontier opens in view ----------------------------
  run = await readRun();
  const mid = { ...run, clearedNodeIds: ['battery', 'wallst', 'cityhall', 'bkbridge'], currentNodeId: 'cityhall', heroes: [run.heroes[0], 'hero_abrams', 'hero_kelvin'].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3), status: 'active' };
  if (mid.heroes.length < 3) mid.heroes.push('hero_haze');
  await writeRun(mid);
  await toMap();
  await shot('midrun');
  stops = await b.evaluate(STOPS);
  const docks3 = await b.evaluate(DOCKS);
  const cleared3 = stops.filter((s) => s.state === 'cleared').map((s) => s.id);
  const open3 = stops.filter((s) => s.state === 'open');
  check('3a four stops read cleared', cleared3.length === 4, cleared3.join(','));
  check('3b open stops are Times Square, Gowanus, Liberty State Park',
    open3.map((s) => s.id).sort().join(',') === 'gowanus,liberty_sp,timessq', open3.map((s) => s.id).join(','));
  check('3c every open stop is in view and not under a dock', open3.every((s) => onScreen(s) && !inDock(s, docks3)),
    open3.map((s) => `${s.id}@${Math.round(s.x)},${Math.round(s.y)}`).join(' '));

  // At rest only the open stops move: each one pulses. The routes hold still.
  const anim = await b.evaluate(`(() => {
    const names = {};
    for (const el of document.querySelectorAll('*')) {
      const n = getComputedStyle(el).animationName;
      if (n && n !== 'none' && /^story-/.test(n)) names[n] = (names[n] ?? 0) + 1;
    }
    return names;
  })()`);
  check('3d at rest the only running animation is story-pulse on the open stops',
    anim['story-pulse'] === 3 && Object.keys(anim).length === 1, JSON.stringify(anim));

  // ---- 4. alignment at three zooms, mid-flight, and after a pan ------------------
  const aligned = [];
  aligned.push(['frontier', await b.evaluate(ALIGN)]);
  await zoomButton('Zoom out', 3);
  aligned.push(['widest', await b.evaluate(ALIGN)]);
  await zoomButton('Zoom in', 5);
  aligned.push(['close', await b.evaluate(ALIGN)]);
  await b.evaluate(`document.querySelector('[aria-label="Zoom out"]').click()`);
  await sleep(120);
  aligned.push(['mid-flight', await b.evaluate(ALIGN)]);
  await sleep(700);
  const p4 = await bareMap();
  if (p4) await drag(p4.x, p4.y, p4.x - W * 0.25, p4.y - H * 0.15);
  await sleep(400);
  aligned.push(['after a pan', await b.evaluate(ALIGN)]);
  for (const [name, a] of aligned) check(`4 stops sit on their map points — ${name}`, a.worst <= 1.5, `worst ${a.worst.toFixed(2)}px at ${a.at}, s=${a.s.toFixed(2)}`);

  // ---- 5. wheel zoom anchors at the cursor; at rest the scale is exactly 1 -------
  await toMap();
  const cur = await bareMap();
  const mapPt = await b.evaluate(`(() => { const m = document.querySelector('[data-map-layer] svg').getScreenCTM().inverse(); const p = new DOMPoint(${cur.x}, ${cur.y}).matrixTransform(m); return { x: p.x, y: p.y }; })()`);
  const s0 = (await b.evaluate(LAYER)).s;
  for (let i = 0; i < 3; i++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cur.x, y: cur.y, deltaX: 0, deltaY: i < 2 ? -120 : 60 });
    await sleep(60);
  }
  await sleep(500);
  const after = await b.evaluate(`(() => { const p = new DOMPoint(${mapPt.x}, ${mapPt.y}).matrixTransform(document.querySelector('[data-map-layer] svg').getScreenCTM()); return { x: p.x, y: p.y }; })()`);
  const lay5 = await b.evaluate(LAYER);
  const drift = Math.hypot(after.x - cur.x, after.y - cur.y);
  check('5a wheel zoom keeps the map point under the cursor', drift <= 2 && Math.abs(lay5.s - s0) > 0.05, `drift ${drift.toFixed(2)}px, s ${s0.toFixed(2)} → ${lay5.s.toFixed(2)}`);
  check('5b at rest the map layer is laid out at the zoom (scale exactly 1)', / scale\(1\)$/.test(lay5.transform), lay5.transform);
  // Zoom bands: step from the widest view to the closest, reading the band
  // only once the camera rests (it follows the laid-out zoom).
  await zoomButton('Zoom out', 8);
  await waitRest();
  const seen = [];
  for (let i = 0; i < 9; i++) {
    const l = await b.evaluate(LAYER);
    seen.push(l);
    await zoomButton('Zoom in');
    await waitRest();
  }
  const bandsOk = seen.every((l) => l.band === band(l.s));
  const bandSet = new Set(seen.map((l) => l.band));
  check('5c data-zoom reads far / mid / near at the right scales', bandsOk && bandSet.size === 3,
    seen.map((l) => `${l.s.toFixed(2)}:${l.band}`).join(' '));
  check('5d the closest zoom reaches the absolute floor (≥ 4.6 px/unit)', seen[seen.length - 1].s >= 4.6 - 1e-3, seen[seen.length - 1].s.toFixed(3));

  // A wheel turn that crosses a band boundary: the band holds for the whole
  // turn (a band change repaints the sheet) and flips only once it rests.
  {
    await zoomButton('Zoom out', 8);
    await waitRest();
    const start = await b.evaluate(LAYER);
    const during = [];
    let crossed = false;
    for (let i = 0; i < 12 && !crossed; i++) {
      await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: -100 });
      await sleep(90);
      const l = await b.evaluate(LAYER);
      during.push(l);
      crossed = band(l.s) !== start.band;
    }
    // One more notch past the boundary, still mid-turn.
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: -40 });
    await sleep(90);
    during.push(await b.evaluate(LAYER));
    await waitRest();
    const rest = await b.evaluate(LAYER);
    const held = during.every((l) => l.band === start.band);
    check('5e the band holds through a wheel turn and flips only at rest',
      crossed && held && rest.band === band(rest.s) && rest.band !== start.band,
      `start ${start.band}@${start.s.toFixed(2)}; during ${during.map((l) => `${l.band}@${l.s.toFixed(2)}`).join(' ')}; at rest ${rest.band}@${rest.s.toFixed(2)}`);
  }

  // ---- 6. drag to every edge: the sheet always covers the viewport ---------------
  let worstGap = 0, gapAt = '', strokes = 0, edges = 0;
  for (const zoom of ['widest', 'close']) {
    await zoomButton(zoom === 'widest' ? 'Zoom out' : 'Zoom in', zoom === 'widest' ? 8 : 3);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      strokes += await panToEdge(dx, dy);
      const r = await b.evaluate(`(() => { const r = document.querySelector('[data-map-layer] svg').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
      const gap = Math.max(r.l, r.t, W - r.r, H - r.b);
      // Pinned to the sheet's edge on the side we pushed toward?
      if ((dx > 0 && Math.abs(r.l) < 0.5) || (dx < 0 && Math.abs(r.r - W) < 0.5) || (dy > 0 && Math.abs(r.t) < 0.5) || (dy < 0 && Math.abs(r.b - H) < 0.5)) edges++;
      if (gap > worstGap) { worstGap = gap; gapAt = `${zoom} ${dx},${dy}`; }
    }
  }
  // Must have really travelled: strokes moved the map, and pushes ended
  // against the sheet's edge (at cover one axis has no play, so not all 12).
  check('6 dragging to every edge never shows past the sheet', worstGap <= 0.5 && strokes >= 10 && edges >= 8,
    `worst gap ${worstGap.toFixed(2)}px ${gapAt}; ${strokes} strokes moved it, ${edges}/12 pushes reached the edge`);
  await shot('edge-drag');

  // ---- 6b. at the widest view, no tag leaves the screen or hides under the HUD -----
  {
    await writeRun(mid);
    await toMap();
    await zoomButton('Zoom out', 8);
    const TAGS = `(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
      const hud = [...document.querySelectorAll('[data-hud="credit"], [data-hud="controls"]')].map(box);
      return [...document.querySelectorAll('[data-tag]')].map((el) => {
        const b = box(el);
        return { text: el.textContent, must: el.dataset.tag === 'must', ...b,
          underHud: hud.some((h) => b.x0 < h.x1 && h.x0 < b.x1 && b.y0 < h.y1 && h.y0 < b.y1) };
      });
    })()`;
    const bad = [];
    let seen = 0;
    const views = [];
    for (const [name, dx, dy] of [['as framed', 0, 0], ['far left', 1, 0], ['far right', -1, 0], ['top', 0, 1], ['bottom', 0, -1]]) {
      if (dx || dy) await panToEdge(dx, dy);
      views.push(await layerTransform());
      const tags = await b.evaluate(TAGS);
      seen += tags.length;
      for (const t of tags) {
        if (t.x0 < -0.5 || t.y0 < -0.5 || t.x1 > W + 0.5 || t.y1 > H + 0.5) bad.push(`${name}: "${t.text}" off screen`);
        if (t.must && t.underHud) bad.push(`${name}: "${t.text}" under the credit or controls`);
      }
      if (name === 'as framed' || name === 'far right') await shot(`widest-${name.replace(' ', '-')}`);
    }
    const distinct = new Set(views).size;
    check('6b widest view: every tag on screen, no must-show tag under the credit or controls', bad.length === 0 && seen > 0 && distinct >= 3,
      bad.length ? bad.slice(0, 6).join('; ') : `${seen} tags checked over ${distinct} distinct views`);
  }

  // ---- 7. recruit: Recruit → select → confirm ------------------------------------
  await writeRun(mid);
  await toMap();
  await b.clickEl(stopEl('timessq'));
  await sleep(500);
  await shot('stopcard-recruit');
  await b.clickEl(button('Recruit at Times Square'));
  await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Recruit a hero"] [data-pick="0"]')`);
  await sleep(800);
  await b.clickEl(`document.querySelector('[data-pick="0"]')`);
  await sleep(300);
  await b.clickEl(inDialog('Recruit a hero', 'Recruit '));
  await sleep(900);
  await shot('recruited');
  run = await readRun();
  stops = await b.evaluate(STOPS);
  check('7 recruit: roster +1, stop cleared, card closed',
    run.heroes.length === mid.heroes.length + 1 && run.clearedNodeIds.includes('timessq')
      && stops.find((s) => s.id === 'timessq').state === 'cleared'
      && !(await b.evaluate(`!!document.querySelector('[aria-label="Times Square, Recruit"]')`)),
    `heroes ${run.heroes.length}, cleared ${run.clearedNodeIds.join(',')}`);

  // ---- 8. full roster: the next recruit stop reads Supply → Take ------------------
  await toMap();
  const met = (await b.evaluate(STOPS)).find((s) => s.id === 'themet');
  const deckBefore = run.deck.length;
  check('8a with a full roster the recruit stop reads Supply', run.heroes.length === 4 && / — Supply — open$/.test(met.label), met.label);
  await b.clickEl(stopEl('themet'));
  await sleep(500);
  await shot('stopcard-supply');
  await b.clickEl(button('Open the cache at The Met'));
  await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Take a supply"] [data-pick="0"]')`);
  await sleep(800);
  await b.clickEl(`document.querySelector('[data-pick="0"]')`);
  await sleep(300);
  await b.clickEl(inDialog('Take a supply', 'Take '));
  await sleep(800);
  run = await readRun();
  check('8b Take: deck +1 and the stop cleared', run.deck.length === deckBefore + 1 && run.clearedNodeIds.includes('themet'), `deck ${deckBefore} → ${run.deck.length}`);

  // ---- 9. the run panel flies to a stop and selects it ---------------------------
  await writeRun(mid);
  await toMap();
  // Look away first (to the sheet's top-left corner), so the flight has
  // somewhere to go.
  await zoomButton('Zoom in', 2);
  await panToEdge(1, 1);
  const away = (await b.evaluate(STOPS)).find((s) => s.id === 'gowanus');
  if (PHONE) {
    await b.clickEl(button('Story run: '));
    await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Story run"]')`);
    await sleep(700);
  }
  await b.clickEl(button('The Outer Boroughs:'));
  await sleep(1300);
  await shot('focus-stop');
  stops = await b.evaluate(STOPS);
  const docks9 = await b.evaluate(DOCKS);
  const gow = stops.find((s) => s.id === 'gowanus');
  const card9 = await b.evaluate(`!!document.querySelector('[aria-label="Gowanus Canal, Battle"]')`);
  check('9 a route row flies to its next stop, selected and in view', !onScreen(away) && gow.pressed && card9 && onScreen(gow) && !inDock(gow, docks9),
    `gowanus from ${Math.round(away.x)},${Math.round(away.y)} to ${Math.round(gow.x)},${Math.round(gow.y)} pressed=${gow.pressed} card=${card9}`);

  // Tap on bare map lets go; Escape too.
  const p9b = await bareMap();
  if (p9b) await b.clickAt(p9b.x, p9b.y);
  await sleep(400);
  const deselected = !(await b.evaluate(STOPS)).some((s) => s.pressed);
  check('9b a tap on bare map deselects', deselected);


  // Escape lets go too — and only that: the System menu stays shut.
  await b.clickEl(stopEl('gowanus'));
  await sleep(300);
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
  const escaped = !(await b.evaluate(STOPS)).some((s) => s.pressed);
  // The System sheet's scrim sits at z-index 225 (the gear is always there).
  const systemOpen = await b.evaluate(`[...document.querySelectorAll('div')].some((d) => getComputedStyle(d).zIndex === '225')`);
  check('9b Escape deselects without opening the System menu', escaped && !systemOpen, `deselected=${escaped} system=${systemOpen}`);

  // ---- 9c. Tab onto a stop off screen: the camera brings it into view -------------
  await zoomButton('Zoom in', 3);
  const tabbedTo = {};
  for (let i = 0; i < 60 && Object.keys(tabbedTo).length < 2; i++) {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const id = await b.evaluate(`document.activeElement?.dataset?.stop ?? null`);
    if (id === 'yankee' || id === 'todthill') {
      await sleep(700);
      tabbedTo[id] = (await b.evaluate(STOPS)).find((s) => s.id === id);
    }
  }
  const scrolled = await b.evaluate(`[...document.querySelectorAll('*')].filter((el) => el.scrollTop || el.scrollLeft).length`);
  const tabbed = Object.entries(tabbedTo);
  check('9c Tab onto an off-screen stop brings it into view; nothing scrolls', tabbed.length === 2 && tabbed.every(([, s]) => onScreen(s)) && scrolled === 0,
    tabbed.map(([id, s]) => `${id}@${Math.round(s.x)},${Math.round(s.y)}`).join(' ') + ` scrolled=${scrolled}`);

  // ---- 9d. phone: two fingers pinch about their midpoint ---------------------------
  if (PHONE) {
    await toMap();
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const c = await bareMap();
    const s9 = (await b.evaluate(LAYER)).s;
    const under = await b.evaluate(`(() => { const p = new DOMPoint(${c.x}, ${c.y}).matrixTransform(document.querySelector('[data-map-layer] svg').getScreenCTM().inverse()); return { x: p.x, y: p.y }; })()`);
    const pts = (spread) => [{ x: c.x - spread, y: c.y, id: 0 }, { x: c.x + spread, y: c.y, id: 1 }];
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (let i = 1; i <= 10; i++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(30 + i * 4.5) }); await sleep(16); }
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
    const s9b = (await b.evaluate(LAYER)).s;
    const back9 = await b.evaluate(`(() => { const p = new DOMPoint(${under.x}, ${under.y}).matrixTransform(document.querySelector('[data-map-layer] svg').getScreenCTM()); return { x: p.x, y: p.y }; })()`);
    const drift9 = Math.hypot(back9.x - c.x, back9.y - c.y);
    check('9d a two-finger pinch zooms about its midpoint', s9b / s9 > 1.8 && drift9 <= 3, `s ${s9.toFixed(2)} → ${s9b.toFixed(2)}, drift ${drift9.toFixed(2)}px`);
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  // ---- 9e. a stop selected where its card will land is nudged into the clear -----
  await writeRun(mid);
  await toMap();
  {
    // Phone: just above the run bar, where the taller card will land. Desktop:
    // under the right-hand card column.
    const id = PHONE ? 'liberty_sp' : 'gowanus';
    const want = PHONE ? { x: W * 0.45, y: H - 190 } : { x: W - 200, y: H * 0.42 };
    const from = (await b.evaluate(STOPS)).find((s) => s.id === id);
    const p = await bareMap();
    const clampX = (x) => Math.min(W - 2, Math.max(2, x)), clampY = (y) => Math.min(H - 2, Math.max(2, y));
    await drag(p.x, p.y, clampX(p.x + (want.x - from.x)), clampY(p.y + (want.y - from.y)));
    await sleep(400);
    const placed = (await b.evaluate(STOPS)).find((s) => s.id === id);
    await b.clickEl(stopEl(id));
    await sleep(1000);
    await shot('nudged');
    const now = (await b.evaluate(STOPS)).find((s) => s.id === id);
    const docks = await b.evaluate(DOCKS);
    check('9e a stop whose card lands on it is nudged clear of the docks',
      Math.hypot(now.x - placed.x, now.y - placed.y) > 20 && now.pressed && onScreen(now) && !inDock(now, docks),
      `${id} placed ${Math.round(placed.x)},${Math.round(placed.y)} → ${Math.round(now.x)},${Math.round(now.y)}`);
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(400);
  }

  // ---- 10. abandon → intro, save gone ----------------------------------------------
  if (PHONE) {
    await b.clickEl(button('Story run: '));
    await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Story run"]')`);
    await sleep(700);
  }
  const ab = await b.clickEl(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase() === 'abandon run')`);
  await sleep(300);
  if (ab.hit !== 'HIT') console.log(`  (the Abandon press was covered: ${ab.hit})`);
  await b.clickEl(button('Abandon this run'));
  const intro = await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Streets of New York"]')`).catch(() => false);
  await sleep(600);
  await shot('abandoned');
  check('10 Abandon → intro sheet, save gone', intro && (await readRun()) === null);

  // ---- 11. lost and won sheets -------------------------------------------------------
  await writeRun({ ...mid, status: 'lost' });
  await b.navigate(URL);
  const lost = await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Run over"]')`).catch(() => false);
  await sleep(900);
  await shot('lost');
  await writeRun({ ...mid, status: 'won' });
  await b.navigate(URL);
  const won = await b.waitFor(`document.querySelector('[role="dialog"][aria-label="Campaign won"]')`).catch(() => false);
  await sleep(900);
  await shot('won');
  check('11 lost and won sheets show over the map', lost && won && !(await b.evaluate(`document.querySelectorAll('[data-stop]').length`)));

  // ---- 13. reduced motion: nothing moves on its own, the buttons jump ---------------
  await writeRun(mid);
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await toMap();
  const moving = await b.evaluate(`[...document.querySelectorAll('[data-stop], [data-stop] *, svg path')].filter((el) => /story-/.test(getComputedStyle(el).animationName)).length`);
  const z0 = (await b.evaluate(LAYER)).s;
  await b.evaluate(`document.querySelector('[aria-label="Zoom in"]').click()`);
  await sleep(40);
  const z1 = (await b.evaluate(LAYER)).s;
  await sleep(600);
  const z2 = (await b.evaluate(LAYER)).s;
  await shot('reduced-motion');
  check('13 reduced motion: no ambient animation, zoom jumps', moving === 0 && Math.abs(z1 - z2) < 1e-3 && z2 > z0 * 1.2,
    `${moving} animated, s ${z0.toFixed(2)} → ${z1.toFixed(2)} (40ms) → ${z2.toFixed(2)}`);
  await b.send('Emulation.setEmulatedMedia', { features: [] });
  await b.evaluate(`localStorage.removeItem('${KEY}')`);
} catch (err) {
  check('harness ran to the end', false, String(err?.message ?? err).slice(0, 300));
} finally {
  // React's dev-only warnings are noise here, as is framer's note that the
  // (emulated) OS asks for reduced motion; anything else is a failure.
  const errors = b.errors.filter((e) => !/^\[console\.(error|warning)\] Warning: /.test(e) && !/You have Reduced Motion enabled/.test(e));
  check('12 no page errors', errors.length === 0, errors.slice(0, 5).map((e) => e.slice(0, 200)).join(' | '));
  await b.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
