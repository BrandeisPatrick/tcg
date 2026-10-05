/**
 * Performance probe — loads a production build in headless Chrome as a phone
 * (390×844 at 3x, touch, CPU throttled), plays scripted gestures on the title
 * screen, the story map and a lesson's board, and reports for each scenario
 * where the time went: frame pacing, main-thread work, and raster — in total
 * and per compositor layer, so a layer whose tiles are slow to rasterise (the
 * story map's sheet, say) shows up by itself.
 *
 *   npm run build                                  # in the tree to measure
 *   node scripts/qa/perf.mjs [ROOT] [label] [cpuRate=4] [cdpPort=9471]
 *
 * ROOT is any checkout or worktree with a dist/ (default: this one); the
 * probe serves ROOT/dist on cdpPort+500 and drives Chrome with ROOT's own
 * cdp.mjs, whose profile is removed when the probe ends (or is killed). The
 * map scenarios open a fixed mid-run save (RUN=<file> to use another).
 * Writes perf-<label>.json to OUT (default: the OS temp dir).
 *
 * Reading a line:
 *   fps, frame avg / p95 / max, >33ms, >50ms — requestAnimationFrame pacing.
 *   script / style / layout / paint — main-thread ms, from the trace.
 *   raster N (tasks) — RasterTask ms over every layer; cpu — the same in
 *     thread CPU time, which moves less than wall time on a busy machine.
 *   layers — the costliest layers: id tiles×avg-ms.
 *   map tile — the sheet's layer (the one that rasterises most during the
 *     map pan): ms per tile. A tile scrolled into view must be rasterised
 *     before it shows, so this is what makes a pan or a pinch keep up.
 * Timings are noisy when anything else runs: take the median of three runs
 * and trust only large effects.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const LABEL = process.argv[3] ?? 'run';
const RATE = Number(process.argv[4] ?? 4);
const PORT = Number(process.argv[5] ?? 9471);
const OUT = process.env.OUT ?? tmpdir();
const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no build at ${DIST} — run npm run build there first`);
const { launch } = await import(join(ROOT, 'scripts/qa/cdp.mjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a static server for the build (the app lives under /tcg/) ------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/tcg/, '');
  if (p === '' || p === '/') p = '/index.html';
  const f = join(DIST, p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT + 500, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT + 500}/tcg/`;

// A run three heroes in: Battery Park, Wall Street, City Hall and the
// Brooklyn Bridge cleared, so the map opens on a frontier in lower Manhattan.
const RUN = process.env.RUN ? JSON.parse(readFileSync(process.env.RUN, 'utf8')) : {
  seed: 12345,
  nodes: [
    ['battery', 'battle', 0, 0.4473518581265126, 0.5419575588150223, ['wallst', 'bkbridge', 'liberty_sp'], 'Battery Park', 'start'],
    ['wallst', 'recruit', 1, 0.48038333428065855, 0.5044219546094405, ['cityhall'], 'Wall Street', 'spine'],
    ['cityhall', 'battle', 2, 0.5085458903059511, 0.46310766606271303, ['timessq'], 'City Hall Subway', 'spine', 'hero_mo_krill'],
    ['timessq', 'recruit', 3, 0.5349829349810289, 0.39487179487179214, ['themet'], 'Times Square', 'spine'],
    ['themet', 'recruit', 4, 0.5924548995927623, 0.3358974358974238, ['reservoir'], 'The Met', 'spine'],
    ['reservoir', 'battle', 5, 0.609946367083259, 0.27948717948717045, ['cloisters'], 'Central Park Reservoir', 'spine', 'hero_kelvin'],
    ['cloisters', 'supply', 6, 0.6649195506249063, 0.17948717948716497, ['yankee'], 'The Cloisters', 'spine'],
    ['yankee', 'boss', 7, 0.7298878584468271, 0.12307692307691159, [], 'Yankee Stadium', 'spine', 'hero_abrams'],
    ['bkbridge', 'recruit', 1, 0.5174914674905322, 0.5384615384615314, ['gowanus'], 'Brooklyn Bridge', 'boroughs'],
    ['gowanus', 'battle', 2, 0.5262372012357629, 0.5999999999999963, ['botanic'], 'Gowanus Canal', 'boroughs', 'hero_viscous'],
    ['botanic', 'recruit', 3, 0.5849585563825394, 0.6358974358974403, ['greenwood'], 'Botanic Garden', 'boroughs'],
    ['greenwood', 'battle', 4, 0.5324841539109783, 0.6743589743589808, ['flushing'], 'Green-Wood Cemetery', 'boroughs', 'hero_lady_geist'],
    ['flushing', 'recruit', 5, 0.5774622131723163, 0.7179487179487146, ['citifield'], 'Prospect Park', 'boroughs'],
    ['citifield', 'supply', 6, 0.5524744024715611, 0.7743589743589863, ['coney'], 'Barclays Center', 'boroughs'],
    ['coney', 'boss', 7, 0.542479278191252, 0.8615384615384721, [], 'Coney Island', 'boroughs', 'hero_sinclair'],
    ['liberty_sp', 'recruit', 1, 0.375060946496295, 0.5179487179487219, ['liberty'], 'Liberty State Park', 'gates'],
    ['liberty', 'recruit', 2, 0.3450755736554029, 0.5628205128205133, ['portnewark'], 'Statue of Liberty', 'gates'],
    ['portnewark', 'battle', 3, 0.26261579834294985, 0.6230769230769206, ['siferry'], 'Port Newark', 'gates', 'hero_drifter'],
    ['siferry', 'recruit', 4, 0.3150902008145109, 0.682051282051289, ['jerseyheights'], 'St. George Ferry', 'gates'],
    ['jerseyheights', 'battle', 5, 0.27011214155317287, 0.7487179487179471, ['todthill'], 'Stapleton', 'gates', 'hero_shiv'],
    ['todthill', 'boss', 6, 0.20514383373125192, 0.8256410256410283, [], 'Todt Hill', 'gates', 'hero_vindicta'],
  ].map(([id, kind, depth, x, y, next, name, region, enemy]) => ({ id, kind, depth, x, y, next, name, region, ...(enemy ? { enemy } : {}) })),
  currentNodeId: 'bkbridge',
  clearedNodeIds: ['battery', 'wallst', 'cityhall', 'bkbridge'],
  heroes: ['hero_abrams', 'hero_kelvin', 'hero_haze'],
  deck: ['healing_rite', 'rusted_barrel', 'extra_health', 'extended_magazine', 'cold_front', 'restorative_shot'],
  status: 'active',
};

// ---- tracing ----------------------------------------------------------------------
const b = await launch({ port: PORT, width: 390, height: 844, scale: 3 });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__ft = []; window.__lt = []; (function loop(t) { if (t) window.__ft.push(t); requestAnimationFrame(loop); })(0); try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}` });
const out = { label: LABEL, root: ROOT, rate: RATE, scenarios: {} };
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'cc', 'benchmark', 'blink'];
let mapLayer = null;
let events = [];
let traceDone = () => {};
b.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
b.on('Tracing.tracingComplete', () => traceDone());

async function trace(name, fn, { settle = 400, reset = true } = {}) {
  events = [];
  if (reset) await b.evaluate(`(() => { window.__ft = []; window.__lt = []; })()`);
  await b.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: CATEGORIES } });
  const t0 = Date.now();
  await fn();
  await sleep(settle);
  const wall = Date.now() - t0;
  const done = new Promise((r) => { traceDone = r; });
  await b.send('Tracing.end');
  await done;
  const ft = await b.evaluate(`({ ft: window.__ft || [], lt: window.__lt || [] })`);
  const iv = ft.ft.slice(1).map((t, i) => t - ft.ft[i]);
  const sorted = [...iv].sort((a, c) => a - c);
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
  const sum = {}, count = {}, layers = {};
  let rasterCpu = 0;
  for (const e of events) {
    if (e.ph === 'X' && typeof e.dur === 'number') { sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000; count[e.name] = (count[e.name] ?? 0) + 1; }
    else if (e.ph === 'I' || e.ph === 'i' || e.ph === 'R') count[e.name] = (count[e.name] ?? 0) + 1;
    if (e.name === 'RasterTask' && e.ph === 'X') {
      const cpu = (e.tdur ?? e.dur) / 1000;
      rasterCpu += cpu;
      const id = String(e.args?.tileData?.layerId ?? '?');
      const l = (layers[id] ??= { tiles: 0, ms: 0, cpu: 0 });
      l.tiles++; l.ms += e.dur / 1000; l.cpu += cpu;
    }
  }
  const pick = (n) => Math.round(sum[n] ?? 0);
  const r1 = (v) => Math.round(v * 10) / 10;
  const topLayers = Object.entries(layers).sort((a, c) => c[1].ms - a[1].ms).slice(0, 5)
    .map(([id, l]) => ({ id, tiles: l.tiles, ms: Math.round(l.ms), cpu: Math.round(l.cpu), avg: r1(l.ms / l.tiles) }));
  if (name === 'map-pan-2s' && topLayers.length) mapLayer = topLayers[0].id;
  const r = {
    wallMs: wall,
    frames: iv.length,
    fps: iv.length ? r1((iv.length / (ft.ft[ft.ft.length - 1] - ft.ft[0])) * 1000) : 0,
    frameMs: { avg: r1(iv.reduce((a, c) => a + c, 0) / (iv.length || 1)), p50: r1(q(0.5)), p95: r1(q(0.95)), max: r1(q(1)) },
    over33: iv.filter((x) => x > 33.4).length,
    over50: iv.filter((x) => x > 50).length,
    longTasks: ft.lt,
    mainMs: { script: pick('FunctionCall') + pick('EvaluateScript') + pick('TimerFire') + pick('FireAnimationFrame') + pick('EventDispatch'), runTask: pick('RunTask'), style: pick('UpdateLayoutTree'), layout: pick('Layout'), prePaint: pick('PrePaint'), paint: pick('Paint'), layerize: pick('Layerize'), commit: pick('Commit') },
    rasterMs: pick('RasterTask'),
    rasterCpuMs: Math.round(rasterCpu),
    rasterTasks: count.RasterTask ?? 0,
    layers: topLayers,
    imageDecodeMs: pick('ImageDecodeTask') + pick('Decode Image'),
    drawFrames: count.DrawFrame ?? 0,
    droppedFrames: count.DroppedFrame ?? 0,
    top: Object.entries(sum).sort((a, c) => c[1] - a[1]).slice(0, 14).map(([n, v]) => `${n}:${Math.round(v)}`),
  };
  out.scenarios[name] = r;
  r.layersById = layers;
  return r;
}

function print(name, r) {
  const map = mapLayer && r.layersById[mapLayer];
  const mapTile = map ? `${(map.ms / map.tiles).toFixed(1)}ms×${map.tiles}` : '-';
  console.log(`${name.padEnd(18)} fps ${String(r.fps).padStart(4)}  frame ${r.frameMs.avg}/${r.frameMs.p95}/${r.frameMs.max} >33 ${r.over33} >50 ${r.over50}`
    + ` | script ${r.mainMs.script} style ${r.mainMs.style} layout ${r.mainMs.layout} paint ${r.mainMs.paint}`
    + ` | raster ${r.rasterMs} (${r.rasterTasks}) cpu ${r.rasterCpuMs} | map tile ${mapTile}`
    + ` | layers ${r.layers.slice(0, 3).map((l) => `${l.id}:${l.tiles}×${l.avg}`).join(' ')}`
    + (r.longTasks.length ? ` | long ${JSON.stringify(r.longTasks)}` : ''));
}

// ---- scenarios ----------------------------------------------------------------------
const touch = (type, pts) => b.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
const C = { x: 195, y: 380 };
/** A figure-eight drag, two seconds. */
const pan = async () => {
  await touch('touchStart', [C]);
  for (let i = 1; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    await touch('touchMove', [{ x: C.x + Math.sin(a) * 140, y: C.y + Math.sin(a * 2) * 160 }]);
    await sleep(16);
  }
  await touch('touchEnd', []);
};
const pinch = async (from, to, steps = 60) => {
  const pts = (d) => [{ x: C.x - d / 2, y: C.y - d / 3 }, { x: C.x + d / 2, y: C.y + d / 3 }];
  await touch('touchStart', pts(from));
  for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(from + ((to - from) * i) / steps)); await sleep(16); }
  await touch('touchEnd', []);
};

const runs = [];
const scenario = async (name, fn, opts) => runs.push([name, await trace(name, fn, opts)]);
try {
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.navigate('about:blank');
  await b.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await scenario('title-load', async () => { await b.navigate(BASE); await b.waitFor(`document.querySelector('#root')?.children.length > 0`); await sleep(1500); }, { reset: false });
  await scenario('title-idle-2s', () => sleep(2000), { settle: 0 });

  await b.evaluate(`localStorage.setItem('deadlock-tcg-story', ${JSON.stringify(JSON.stringify(RUN))})`);
  await scenario('map-open', async () => {
    await b.navigate(BASE + '?screen=story');
    await b.waitFor(`document.querySelector('[data-map-layer]')`, { timeout: 60000 });
    await sleep(2500);
  }, { reset: false });
  await scenario('map-idle-2s', () => sleep(2000), { settle: 0 });
  await scenario('map-pan-2s', pan);
  await scenario('map-pinch-in', () => pinch(70, 300), { settle: 900 });
  await scenario('map-pan-zoomed-2s', pan);
  await scenario('map-pinch-out', () => pinch(300, 60), { settle: 900 });
  await scenario('map-pinch-out-2', () => pinch(300, 60), { settle: 900 });
  out.mapFacts = await b.evaluate(`(() => { const L = document.querySelector('[data-map-layer]'); const r = L.getBoundingClientRect(); return { layer: [Math.round(r.width), Math.round(r.height)], elements: L.querySelectorAll('*').length, band: L.dataset.zoom }; })()`);

  // A lesson: a small fixed fight.
  await scenario('board-open', async () => {
    await b.navigate(BASE + '?lesson=1');
    await b.waitFor(`[...document.querySelectorAll('button')].some((x) => /end turn/i.test(x.textContent) || /end turn/i.test(x.getAttribute('aria-label') || ''))`, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
  }, { reset: false });
  await scenario('board-idle-2s', () => sleep(2000), { settle: 0 });
  out.errors = b.errors.slice(0, 6);
} finally {
  await b.close();
  server.close();
}
for (const [name, r] of runs) print(name, r);
console.log('map layer:', mapLayer, JSON.stringify(out.mapFacts ?? {}), out.errors?.length ? `errors: ${JSON.stringify(out.errors)}` : '');
for (const r of Object.values(out.scenarios)) delete r.layersById;
const file = join(OUT, `perf-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log('wrote', file);
