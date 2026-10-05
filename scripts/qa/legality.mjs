/**
 * Board legality playtest — the board and the hand ask the engine whether a
 * move is legal, and say why when it is not. Each case drafts nothing by hand:
 * it reaches a real match, syncs a doctored `G` into the live boardgame.io
 * client (React fiber walk -> store SYNC) to stage a board a game rarely
 * reaches, then plays it with real mouse events:
 *
 *   a  Sinclair's copied ultimate (costOverride 0) prints a 0 and is played
 *      with no souls
 *   b  a spell dragged onto a rival corpse is refused with a sticker; the
 *      card stays in hand and nothing is left armed
 *   c  gear armed while a hero already wears it: that hero does not glow, and
 *      tapping it says "already wears" — no replace chooser
 *   d  a hero at the equipment cap still glows, and tapping it opens the
 *      replace chooser; picking an item plays the card
 *   e  the hero sheet: SPI includes Spirit Power, and Sleep / Reverb chips
 *      wear the debuff colour
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/legality.mjs OUT_DIR [PORT] [desktop|mobile]
 */
import { launch, byText } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? './legality-shots');
const PORT = Number(process.argv[3] ?? 9341);
const MODE = process.argv[4] ?? 'desktop';
mkdirSync(OUT, { recursive: true });
const W = MODE === 'mobile' ? 390 : 1440, H = MODE === 'mobile' ? 844 : 900;

// See tutorial.mjs: a React `Warning:` fails the run unless listed here with a reason.
const ALLOWED_WARNINGS = [];

const TARGET_GREEN = 'rgb(98, 196, 98)'; // poster.target

const b = await launch({ port: PORT, width: W, height: H, scale: MODE === 'mobile' ? 2 : 1 });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const shot = async (name) => { const f = join(OUT, `${MODE}-${name}.png`); await b.shot(f); console.log('  shot:', f); };
const text = () => b.evaluate(`document.body.textContent.replace(/\\s+/g, ' ')`);
/** The page's text once `re` shows in it (ticking the virtual clock a little between looks), or as it stands. */
const textWith = async (re) => {
  for (let i = 0; i < 12; i++) {
    const t = await text();
    if (re.test(t)) return t;
    await b.tick(60); await b.settle(2);
  }
  return text();
};

// ---- the live client ------------------------------------------------------
const CLIENT = `(() => {
  if (window.__qaClient) return window.__qaClient;
  const root = document.getElementById('root');
  const key = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
  const stack = [root[key]];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    if (f.stateNode && f.stateNode.client && f.stateNode.client.store) { window.__qaClient = f.stateNode.client; return window.__qaClient; }
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return null;
})()`;
const G = () => b.evaluate(`(() => { const c = ${CLIENT}; return JSON.parse(JSON.stringify(c.getState().G)); })()`);

/** Sync `G` after `mutate(G)` (a function source, run in the page) has doctored a copy. */
const stage = async (mutate) => {
  await b.evaluate(`(() => {
    const c = ${CLIENT};
    const st = c.getState();
    const G = structuredClone(st.G);
    (${mutate})(G);
    c.store.dispatch({ type: 'SYNC', state: { ...st, G } });
  })()`);
  await b.settle(4); await b.tick(900); await b.settle(3);
};

// Page-side helpers, as source the staged mutations share.
const PAGE = `
  const inst = (iid, cardId, over = {}) => ({ iid, cardId, ownerId: '0', zone: 'hand', attached: [], hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false, ...over });
  const worn = (iid, cardId, on) => inst(iid, cardId, { zone: 'equipment', attachedTo: on });
`;

// ---- reach a real match ---------------------------------------------------
await b.navigate(`${DEV_URL}/?screen=match&vtclock=1`);
await b.waitFor(`document.querySelector('[aria-label^="Select "]')`, { timeout: 20000 });
const lockIn = `[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Lock In'))`;
const endTurn = `document.querySelector('[aria-label="End Turn"]')`;
for (let i = 0; i < 80; i++) {
  const st = await b.evaluate(`(() => {
    const lock = ${byText('Lock')};
    return { draft: !!document.querySelector('[aria-label^="Select "]') || !!lock, live: !!lock && !lock.disabled, mulligan: !!${lockIn}, board: !!${endTurn} };
  })()`);
  if (st.mulligan || (!st.draft && st.board)) break;
  if (st.live) {
    await b.evaluate(`document.querySelector('[aria-label^="Select "]').click()`);
    await b.settle(3);
    await b.clickEl(byText('Lock'), { js: true, scroll: false });
    await b.settle(3);
  }
  await b.tick(400); await b.settle(2);
}
if (await b.evaluate(`!!${lockIn}`)) { await b.clickEl(lockIn, { js: true, scroll: false }); await b.settle(3); }
await b.waitFor(endTurn, { timeout: 8000 });
await b.tick(1500); await b.settle(3);
if (!(await b.evaluate(`!!${CLIENT}`))) throw new Error('could not find the boardgame.io client in the React tree');
const base = await G();
console.log(`match reached: turn ${base.turnNumber}, you have ${base.players['0'].souls} souls, hand ${base.players['0'].hand.length}`);

// ---- finders ----------------------------------------------------------------
// Hand cards are the draggable role=button elements (touch-action: none).
const HAND = `[...document.querySelectorAll('[role="button"][aria-label]')].filter((e) => e.style.touchAction === 'none')`;
const handCard = (prefix, nth = 0) => `(${HAND}).filter((e) => e.getAttribute('aria-label').startsWith(${JSON.stringify(prefix)}))[${nth}]`;
/** The eight hero tiles, in board order: rival bench x3, rival Active, your Active, your bench x3. */
const TILES = `[...document.querySelectorAll('button[aria-label*=" — "]')].filter((e) => /attack|down, respawns/.test(e.getAttribute('aria-label')))`;
const tile = (i) => `(${TILES})[${i}]`;
const tileNames = await b.evaluate(`(${TILES}).map((e) => e.getAttribute('aria-label').split(' — ')[0])`);
console.log('tiles:', tileNames.join(' | '));
const MY_ACTIVE = 4, RIVAL_BENCH_0 = 0, MY_BENCH_0 = 5;
const myActiveName = tileNames[MY_ACTIVE];
const glow = () => b.evaluate(`(${TILES}).map((e) => getComputedStyle(e).borderTopColor === ${JSON.stringify(TARGET_GREEN)})`);
const costCoins = () => b.evaluate(`(${HAND}).map((card) => {
  const coin = [...card.querySelectorAll('div')].find((d) => d.style.width === '24px' && d.style.borderRadius === '50%');
  return { label: card.getAttribute('aria-label'), coin: coin ? coin.textContent.trim() : null };
})`);
const drag = async (fromEl, toEl) => {
  const rect = (el) => b.evaluate(`(() => { const r = (${el}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const a = await rect(fromEl), z = await rect(toEl);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  // A quick flick, well inside the hand's 500 ms long-press (which opens the big preview).
  for (let i = 1; i <= 8; i++) {
    const x = a.x + ((z.x - a.x) * i) / 8, y = a.y + ((z.y - a.y) * i) / 8;
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    // The drag gesture reads the pointer on animation frames, which stand still
    // under the virtual clock until it is ticked.
    await b.tick(20); await b.settle(1);
  }
  await b.tick(40); await b.settle(1);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z.x, y: z.y, button: 'left', buttons: 0, clickCount: 1 });
  // framer hands the drop to onDragEnd on the next animation frame.
  await b.tick(60); await b.settle(4);
};

try {
  // ===== a: Sinclair's free copied ultimate =====================================
  console.log('\n(a) Sinclair\'s copied ultimate, no souls');
  await stage(`(G) => { ${PAGE}
    G.players['0'].souls = 0;
    G.players['0'].hand = [inst('qa-copy', 'ult_abrams', { costOverride: 0 }), inst('qa-real', 'ult_abrams')];
  }`);
  await b.tick(1200); await b.settle(3); // the hand deals in
  const coins = await costCoins();
  console.log('  hand:', JSON.stringify(coins));
  check('the free copy prints a 0 on its cost coin', coins[0]?.coin === '0', `coin "${coins[0]?.coin}"`);
  check('the free copy is not marked unaffordable', !/cannot afford/.test(coins[0]?.label ?? ''), coins[0]?.label);
  check('the ordinary copy prints its price and is marked unaffordable', /^\d+$/.test(coins[1]?.coin ?? '') && coins[1].coin !== '0' && /cannot afford/.test(coins[1]?.label ?? ''), JSON.stringify(coins[1]));
  await shot('a-hand-free-copy');
  await b.clickEl(`(${HAND})[0]`, { scroll: false });
  await b.settle(4); await b.tick(3200); await b.settle(3);
  const after = await G();
  check('tapping the free copy plays it with 0 souls', !after.players['0'].hand.some((c) => c.iid === 'qa-copy') && after.players['0'].discard.some((c) => c.iid === 'qa-copy'), `hand ${after.players['0'].hand.map((c) => c.iid)}`);
  check('the ordinary copy is still in hand', after.players['0'].hand.some((c) => c.iid === 'qa-real'));
  await shot('a-after-play');

  // ===== b: a spell dragged onto a rival corpse ====================================
  console.log('\n(b) a spell dragged onto a rival corpse');
  await stage(`(G) => { ${PAGE}
    G.players['0'].souls = 10; G.action = null;
    G.players['0'].hand = [inst('qa-hex', 'slowing_hex')];
    for (const h of [G.players['1'].active, ...G.players['1'].bench]) h.statuses = [];
    const corpse = G.players['1'].bench[0]; corpse.hp = 0; corpse.respawnTurnsLeft = 2;
  }`);
  const corpseLabel = await b.evaluate(`${tile(RIVAL_BENCH_0)}.getAttribute('aria-label')`);
  check('the rival bench hero is a corpse on the board', /down, respawns/.test(corpseLabel), corpseLabel);
  await drag(handCard('Slowing Hex'), tile(RIVAL_BENCH_0));
  const notice = await textWith(/Not a valid target for Slowing Hex/i);
  const gb = await G();
  check('the refusal sticker is up', /Not a valid target for Slowing Hex/i.test(notice));
  check('the card stays in hand', gb.players['0'].hand.some((c) => c.iid === 'qa-hex'));
  check('no rival hero was hit', gb.players['1'].bench[0].statuses.length === 0 && gb.players['1'].active.statuses.length === 0);
  check('nothing is left armed (no targeting banner)', !/Any Enemy/.test(notice));
  await b.tick(900); await b.settle(2); // the sticker springs in; the card settles back to the hand
  await shot('b-corpse-refused');
  await b.tick(1500); await b.settle(2);
  await shot('b-corpse-refused-later');

  // ===== c: gear armed while a hero already wears it ================================
  console.log('\n(c) arming an item a hero already wears');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE}
    G.players['0'].souls = 10; G.action = null;
    G.players['1'].bench[0].hp = G.players['1'].bench[0].hpMax; G.players['1'].bench[0].respawnTurnsLeft = 0;
    G.players['0'].hand = [inst('qa-mag', 'extended_magazine')];
    const a = G.players['0'].active; a.attached = [worn('qa-worn-mag', 'extended_magazine', a.iid)];
  }`);
  await b.clickEl(handCard('Extended Magazine'), { scroll: false });
  await b.settle(4); await b.tick(500); await b.settle(3);
  const lit = await glow();
  console.log('  glow:', JSON.stringify(lit));
  check('your Active (already wearing it) does not glow', lit[MY_ACTIVE] === false);
  check('your benched heroes do glow', lit[MY_BENCH_0] && lit[MY_BENCH_0 + 1] && lit[MY_BENCH_0 + 2]);
  check('no rival glows for gear', !lit[0] && !lit[1] && !lit[2] && !lit[3]);
  await shot('c-armed-glow');
  await b.clickEl(tile(MY_ACTIVE), { scroll: false });
  await b.settle(4); await b.tick(500); await b.settle(3);
  const t3 = await text();
  const gc = await G();
  check('the sticker says the hero already wears it', new RegExp(`${myActiveName} already wears Extended Magazine`, 'i').test(t3));
  check('the replace chooser did not open', !/equipment cap/i.test(t3));
  check('the card stays in hand', gc.players['0'].hand.some((c) => c.iid === 'qa-mag'));
  await b.tick(900); await b.settle(2);
  await shot('c-already-wears');

  // ===== d: a hero at the cap =======================================================
  console.log('\n(d) a hero at the equipment cap');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE}
    G.players['0'].souls = 10; G.action = null;
    G.players['0'].hand = [inst('qa-mag', 'extended_magazine')];
    const a = G.players['0'].active;
    a.attached = [worn('qa-w1', 'extra_health', a.iid), worn('qa-w2', 'extra_spirit', a.iid), worn('qa-w3', 'extra_regen', a.iid)];
  }`);
  await b.clickEl(handCard('Extended Magazine'), { scroll: false });
  await b.settle(4); await b.tick(500); await b.settle(3);
  const litCap = await glow();
  check('the full hero still glows', litCap[MY_ACTIVE] === true, JSON.stringify(litCap));
  await b.clickEl(tile(MY_ACTIVE), { scroll: false });
  await b.settle(4); await b.tick(900); await b.settle(3);
  const t4 = await text();
  check('the replace chooser opens', /equipment cap \(3\)/i.test(t4) && new RegExp(`${myActiveName} is at the equipment cap`, 'i').test(t4));
  await b.tick(1500); await b.settle(3); // the chooser fades in and its cards step in
  await shot('d-replace-chooser');
  // Pick the first worn item (a charcoal card box button in the chooser).
  await b.evaluate(`(() => { const box = [...document.querySelectorAll('button')].find((x) => x.style.width === '156px' && x.style.height === '216px'); box.click(); })()`);
  await b.settle(4); await b.tick(2400); await b.settle(3);
  const gd = await G();
  const wornNow = gd.players['0'].active.attached.map((c) => c.cardId);
  check('picking an item plays the card and discards the one chosen', !gd.players['0'].hand.some((c) => c.iid === 'qa-mag') && wornNow.includes('extended_magazine') && wornNow.length === 3 && !wornNow.includes('extra_health'), wornNow.join(','));

  // ===== e: the hero sheet ============================================================
  console.log('\n(e) the hero sheet: SPI and status chips');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE}
    G.action = null;
    const a = G.players['0'].active; a.attached = [];
    a.spiritMod = 1;
    a.statuses = [{ id: 'spirit_power', value: 2, duration: 2 }, { id: 'sleep', value: 1, duration: 2 }, { id: 'reverb', value: 2, duration: 2 }, { id: 'shield', value: 3, duration: 2 }];
  }`);
  await b.clickEl(tile(MY_ACTIVE), { scroll: false });
  await b.settle(4); await b.tick(900); await b.settle(3);
  const sheet = await b.evaluate(`(() => {
    const sheet = document.querySelector('[aria-label="Hero sheet"]') ?? document.body;
    const spi = [...sheet.querySelectorAll('span')].find((s) => s.textContent.trim() === 'SPI');
    const chip = (label) => [...sheet.querySelectorAll('span[title]')].find((s) => s.getAttribute('title').startsWith(label));
    const bg = (el) => el ? getComputedStyle(el).backgroundColor : null;
    return { spi: spi ? spi.previousElementSibling.textContent.trim() : null, sleep: bg(chip('Sleep')), reverb: bg(chip('Reverb')), shield: bg(chip('Shield')) };
  })()`);
  console.log('  sheet:', JSON.stringify(sheet));
  check('SPI is the hero\'s spirit plus Spirit Power (1 + 2)', sheet.spi === '3', `SPI ${sheet.spi}`);
  check('Sleep and Reverb chips are drawn in the debuff colour, not the buff colour', !!sheet.sleep && sheet.sleep === sheet.reverb && sheet.sleep !== sheet.shield, `sleep ${sheet.sleep} reverb ${sheet.reverb} shield ${sheet.shield}`);
  await shot('e-hero-sheet');
} finally {
  const errors = b.errors.filter((e) => !ALLOWED_WARNINGS.some((re) => re.test(e)));
  console.log('\npage errors (React warnings included):', errors.length ? errors.slice(0, 10).map((e) => e.slice(0, 300)) : 'none');
  if (errors.length) results.push({ name: 'page errors', ok: false });
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; FAILED: ${failed.map((r) => r.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
