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
 *   f  a Dome on the rival Active: the Attack plate reads "Their Active cannot
 *      be attacked this turn" and is not a button, and the Dome chip wears its mark
 *   g  a hero with reach (the page's own engine is handed a passive that has
 *      it): Attack arms targeting instead of swinging, the rival's heroes glow,
 *      a tap on your own hero or a domed one is refused with the engine's
 *      reason, and a tap on a bench hero or the Active makes the attack at it
 *   h  Rooted on your Active: Retreat is blocked in the engine's words ("Rooted:
 *      cannot retreat or be swapped") and the hero still has its attack
 *   i  a volley (the live engine is handed an ultimate whose effect is attackAll):
 *      the swings land one after another, a batch the length of a cast and four
 *      swings is played, and the turn's own attack afterwards is walked by the
 *      choreographer with no fx batch of its own (no double play)
 *   j  Last Stand set off by the start-of-turn tick: the engine strikes every
 *      rival hero at once, the tiles hold their numbers until the channel's
 *      strike reaches each, and the batch is played
 *   k  a number's colour says what it scales with, and hovering or tapping it
 *      (or a status) explains it. Kelvin with Spirit 2: his skill prints 3 in
 *      purple; on a desktop hovering it shows "1 + Kelvin's Spirit Power 2 = 3"
 *      and leaving hides it, on a phone (touch emulation, real touches) a tap
 *      opens a popup card that a tap elsewhere or Escape closes, one at a time,
 *      inside 390 px, and a tap on the number never uses the skill plate; a
 *      status word in card text (Stun) and a Bleed chip on a tile explain
 *      themselves the same way, a click on the chip still opens the sheet, and
 *      with a card armed a tap on the chip picks the target, no popup
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/legality.mjs OUT_DIR [PORT] [desktop|mobile]
 */
import { launch, byText, byTextStart } from './cdp.mjs';
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
    return { draft: !!document.querySelector('[aria-label^="Select "]') || !!lock, live: !!lock, mulligan: !!${lockIn}, board: !!${endTurn} };
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
const MY_ACTIVE = 4, RIVAL_BENCH_0 = 0, RIVAL_ACTIVE = 3, MY_BENCH_0 = 5;
const myActiveName = tileNames[MY_ACTIVE];
/** A board a swing can be made on: Turn 2 (Turn 1 has no attack), nothing spent, every hero standing at 30 and clean. */
const READY_TO_ATTACK = `
  G.turnNumber = 2; G.attackUsed = false; G.action = null; G.pendingPromotion = null;
  for (const pid of ['0', '1']) for (const h of [G.players[pid].active, ...G.players[pid].bench]) {
    if (!h) continue;
    h.hp = h.hpMax = 30; h.respawnTurnsLeft = 0; h.statuses = []; h.attackedThisTurn = false; h.skillUsedThisTurn = false;
  }`;
/** What each hero tile prints for its health — it lags the engine while an effect is still to land on it. */
const shownHealth = () => b.evaluate(`(${TILES}).map((e) => Number((e.getAttribute('aria-label').match(/, (\\d+) health/) ?? [])[1]))`);
/** The FX batches mounted right now (the layer's zero-size marker): each one's key and how many ms it runs. */
const fxBatches = () => b.evaluate(`[...document.querySelectorAll('[data-fx-batch]')].map((e) => ({ key: e.getAttribute('data-fx-batch'), total: Number(e.getAttribute('data-fx-total')) }))`);
/** Tap a hero's tile and wait for its sheet to come up. */
const openSheet = async (idx) => { await b.clickEl(tile(idx), { scroll: false }); await b.settle(4); await b.tick(900); await b.settle(3); };
const sheetText = () => b.evaluate(`document.querySelector('[aria-label="Hero sheet"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
/** The sheet's exit fade starts late under the virtual clock: wait it out before tapping what is behind it. */
const sheetGone = async () => {
  for (let i = 0; i < 30; i++) {
    await b.tick(150); await b.settle(2);
    if (!(await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"]')`))) return true;
  }
  return false;
};
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

  // ===== f: a Dome on the rival Active ================================================
  console.log('\n(f) a Dome on the rival Active: the plate says so, and the new chip wears its mark');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK}
    G.players['1'].active.statuses = [{ id: 'dome', value: 1, duration: 1 }];
  }`);
  const domeChip = await b.evaluate(`(() => { const chip = ${tile(RIVAL_ACTIVE)}.querySelector('span[data-status="dome"]'); return chip ? { mark: chip.querySelector('svg[data-mark="dome"]') !== null, text: chip.textContent.trim() } : null; })()`);
  check('the domed rival\'s tile carries a Dome chip with the dome mark', !!domeChip && domeChip.mark, JSON.stringify(domeChip));
  await openSheet(MY_ACTIVE);
  const domeSheet = await sheetText();
  console.log('  sheet:', domeSheet.slice(0, 260));
  check('the Attack plate reads "Their Active cannot be attacked this turn"', /Their Active cannot be attacked this turn/.test(domeSheet), domeSheet.slice(0, 160));
  check('…and is not offered as a button', !(await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`)));
  await shot('f-dome-plate');
  // Tapping the plate does nothing: no attack is made, no targeting arms, the sheet stays up.
  await b.clickEl(`[...document.querySelector('[aria-label="Hero sheet"]').querySelectorAll('span')].find((s) => s.textContent.trim() === 'Attack')`, { scroll: false });
  await b.settle(4); await b.tick(500); await b.settle(3);
  const afterDome = await G();
  check('tapping it makes no attack', afterDome.attackUsed === false && afterDome.players['1'].active.hp === 30);
  check('…arms nothing and the sheet stays up', /Their Active cannot be attacked/.test(await sheetText()) && !/Choose who/.test(await text()));
  await b.clickEl(byText('Close'), { scroll: false });
  await sheetGone();

  // ===== g: an attack that names its target ============================================
  console.log('\n(g) a hero with reach: Attack arms targeting, a tap names who is shot');
  await b.tick(2400); await b.settle(2);
  // No hero of the roster has reach yet, so give the live engine one: register a
  // passive that has it and hand it to your Active's card.
  const reachSetup = await b.evaluate(`(async () => {
    const reg = await import('/src/engine/registry.ts');
    const cards = await import('/src/cards/index.ts');
    reg.registerAbilities([{ id: 'qa_long_arm', name: 'Long Arm', text: 'Its attack may be aimed at any enemy hero.', trigger: 'ongoing', target: 'self', reach: true, run() {} }]);
    const id = ${CLIENT}.getState().G.players['0'].active.cardId;
    const data = cards.CARDS_BY_ID[id];
    data.passives = [...(data.passives ?? []), 'qa_long_arm'];
    return id;
  })()`);
  console.log('  Long Arm given to', reachSetup);
  const rivalNames = tileNames.slice(0, 4);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK} }`);
  const targets = await b.evaluate(`(async () => { const leg = await import('/src/engine/legality.ts'); return leg.attackTargets(${CLIENT}.getState().G, '0').length; })()`);
  check('the engine counts four heroes the reaching Active may name', targets === 4, `${targets}`);
  await openSheet(MY_ACTIVE);
  const plateLabel = await b.evaluate(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')?.getAttribute('aria-label') ?? null`);
  check('the plate is a button and its line is the default target\'s', /^Attack: Hits .+ for \d+ bullet damage\. Free\.$/.test(plateLabel ?? '') && plateLabel.includes(rivalNames[3]), plateLabel);
  await shot('g-sheet-plate');
  await b.clickEl(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`, { scroll: false });
  await b.settle(4);
  await sheetGone();
  const armedText = await textWith(/Choose who/);
  check('the sheet closes and the banner reads "Choose who {Hero} shoots"', new RegExp(`Choose who ${myActiveName} shoots`).test(armedText), (armedText.match(/Choose who[^·]*/) ?? [''])[0]);
  check('tapping Attack has made no attack yet', (await G()).attackUsed === false);
  const litAim = await glow();
  check('the rival\'s four heroes glow, none of yours does', JSON.stringify(litAim) === JSON.stringify([true, true, true, true, false, false, false, false]), JSON.stringify(litAim));
  await shot('g-armed');

  // A tap on one of your own heroes is refused with the engine's reason.
  await b.clickEl(tile(MY_BENCH_0), { scroll: false });
  const refused = await textWith(/That hero cannot be attacked/);
  check('tapping your own hero says "That hero cannot be attacked"', /That hero cannot be attacked/.test(refused));
  await b.tick(300); await b.settle(2);
  check('…nothing was attacked and nothing stays armed', (await G()).attackUsed === false && !(await glow()).some(Boolean));
  await shot('g-refused');

  // A tap on a bench hero names it: the walk, then the engine's attack at that hero.
  const playAttackAt = async (idx, label) => {
    await b.tick(2400); await b.settle(2);
    await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK} }`);
    await openSheet(MY_ACTIVE);
    await b.clickEl(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`, { scroll: false });
    await b.settle(4);
    await sheetGone();
    await textWith(/Choose who/);
    await b.clickEl(tile(idx), { scroll: false });
    await b.settle(4);
    let walked = false, g = await G();
    for (let t = 0; t < 8000 && !g.attackUsed; t += 100) {
      await b.tick(100); await b.settle(1);
      walked = walked || (await b.evaluate(`!!${byTextStart('Skip')}`));
      g = await G();
    }
    await b.tick(1500); await b.settle(3);
    g = await G();
    const foes = [g.players['1'].active, ...g.players['1'].bench].map((h) => h.hp);
    console.log(`  ${label}: walked=${walked} rival HP [active, bench x3]`, JSON.stringify(foes));
    return { g, walked, foes };
  };
  const named = await playAttackAt(RIVAL_BENCH_0, 'a tap on the first rival bench hero');
  check('the choreographer walked the attack', named.walked);
  check('the named bench hero took the swing and nobody else did', named.g.attackUsed && named.foes[1] < 30 && named.foes[0] === 30 && named.foes[2] === 30 && named.foes[3] === 30, JSON.stringify(named.foes));
  await shot('g-after-bench-attack');
  const bare = await playAttackAt(RIVAL_ACTIVE, 'a tap on the rival Active (the default target)');
  check('the rival Active took the swing and nobody else did', bare.g.attackUsed && bare.foes[0] < 30 && bare.foes[1] === 30 && bare.foes[2] === 30 && bare.foes[3] === 30, JSON.stringify(bare.foes));
  await shot('g-after-active-attack');

  // A Dome on the rival Active: still a button (the bench can be named), and the domed hero does not glow.
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK}
    G.players['1'].active.statuses = [{ id: 'dome', value: 1, duration: 1 }];
  }`);
  await openSheet(MY_ACTIVE);
  const domedPlate = await b.evaluate(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')?.getAttribute('aria-label') ?? null`);
  check('with the Active domed the plate is still a button, aimed at the first bench hero', !!domedPlate && domedPlate.includes(rivalNames[0]) && !domedPlate.includes(rivalNames[3]), domedPlate);
  await b.clickEl(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`, { scroll: false });
  await b.settle(4);
  await sheetGone();
  await textWith(/Choose who/);
  const litDome = await glow();
  check('the domed Active does not glow, the three on the bench do', JSON.stringify(litDome) === JSON.stringify([true, true, true, false, false, false, false, false]), JSON.stringify(litDome));
  await shot('g-armed-dome');
  await b.clickEl(tile(RIVAL_ACTIVE), { scroll: false });
  const domeRefusal = await textWith(/That hero cannot be attacked/);
  check('tapping the domed Active says "That hero cannot be attacked"', /That hero cannot be attacked/.test(domeRefusal));
  check('…and no attack was made', (await G()).attackUsed === false);
  await b.tick(900); await b.settle(2);
  await shot('g-dome-refused');
  // Take the passive back off the card: the rest of the run is the roster as it is.
  await b.evaluate(`(async () => { const cards = await import('/src/cards/index.ts'); const data = cards.CARDS_BY_ID[${JSON.stringify(reachSetup)}]; data.passives = (data.passives ?? []).filter((id) => id !== 'qa_long_arm'); })()`);

  // ===== h: Rooted on your Active ======================================================
  console.log('\n(h) Rooted on your Active: Retreat is refused in the engine\'s words, and the hero still fights');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK}
    G.players['0'].souls = 10;
    G.players['0'].active.statuses = [{ id: 'rooted', value: 1, duration: 2 }];
  }`);
  const activeBefore = (await G()).players['0'].active.iid;
  await openSheet(MY_ACTIVE);
  const rootedSheet = await sheetText();
  console.log('  sheet:', rootedSheet.slice(0, 300));
  check('Retreat is blocked with "Rooted: cannot retreat or be swapped"', /Rooted: cannot retreat or be swapped/.test(rootedSheet), rootedSheet.slice(0, 200));
  const retreat = await b.evaluate(`(() => { const btn = [...document.querySelector('[aria-label="Hero sheet"]').querySelectorAll('button')].find((x) => /Retreat/.test(x.textContent)); if (!btn) return null; const r = btn.getBoundingClientRect(); return { disabled: btn.disabled, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  check('the Retreat button is disabled', !!retreat && retreat.disabled, JSON.stringify(retreat));
  check('the Rooted chip on the sheet wears the roots mark', await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"] span[title^="Rooted"] svg[data-mark="rooted"]')`));
  check('a rooted hero still has its attack to make: the plate is a button', await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`));
  await shot('h-rooted-sheet');
  if (retreat) { await b.clickAt(retreat.x, retreat.y); await b.settle(4); await b.tick(500); await b.settle(3); }
  const afterRoot = await G();
  check('pressing it swaps nobody and spends nothing', afterRoot.players['0'].active.iid === activeBefore && afterRoot.players['0'].souls === 10);
  // The engine agrees, through the move itself: a retreat from the board is refused, and says why.
  const moveRefusal = await b.evaluate(`(async () => {
    const h = await import('/src/ui/board/heroActions.ts');
    return h.actionRefusal(${CLIENT}.getState().G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 });
  })()`);
  check('actionRefusal for the retreat is the "Rooted" line', !!moveRefusal && moveRefusal.code === 'rooted' && /^Rooted/.test(moveRefusal.text), JSON.stringify(moveRefusal));
  await b.clickEl(byText('Close'), { scroll: false });
  await sheetGone();

  // ===== i: a volley, played on the live board ============================================
  console.log('\n(i) a volley: the ultimate that swings at every rival hero plays swing after swing, and the turn\'s own attack still is not played twice');
  await b.tick(2400); await b.settle(2);
  // No hero of the roster has a volley yet, so give the live engine one: an
  // ultimate whose effect is `attackAll`, linked to your Active, put in your hand.
  await b.evaluate(`(async () => {
    const reg = await import('/src/engine/registry.ts');
    const cards = await import('/src/cards/index.ts');
    const attack = await import('/src/engine/actions/attack.ts');
    const cast = await import('/src/engine/castContext.ts');
    reg.registerAbilities([{ id: 'eff_qa_volley', trigger: 'onPlay', target: 'noTarget', base: 3, run: (G) => { const caster = cast.currentCast()?.source; if (caster) attack.attackAll(G, caster); } }]);
    const linked = ${CLIENT}.getState().G.players['0'].active.cardId;
    cards.CARDS_BY_ID.ult_qa_volley = { id: 'ult_qa_volley', name: 'Volley', type: 'ultimate', rarity: 4, cost: 0, linkedHero: linked, abilities: ['eff_qa_volley'] };
  })()`);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK}
    G.players['0'].souls = 10;
    G.players['0'].hand = [inst('qa-volley', 'ult_qa_volley')];
  }`);
  await b.tick(1500); await b.settle(3); // the hand deals in
  const T = await b.evaluate(`(async () => (await import('/src/ui/effects/fx/fxCatalog.ts')).FX_TIMING)()`);
  const expectedTotal = T.ultLead + T.castLead + 3 * T.volleyStep + T.hitHold + 80;
  console.log(`  a volley of four lands ${T.volleyStep} ms apart; the batch should run ${expectedTotal} ms`);
  // Wait for the card to be dealt into the hand (on screen, at full size) before tapping it.
  for (let i = 0; i < 30; i++) {
    const r = await b.evaluate(`(() => { const r = (${handCard('Volley')}).getBoundingClientRect(); return { bottom: r.bottom, w: r.width }; })()`);
    if (r.bottom <= H && r.w > 80) break;
    await b.tick(200); await b.settle(2);
  }
  const volleyClick = await b.clickEl(handCard('Volley'), { scroll: false });
  console.log('  tapped the Volley card:', volleyClick.hit);
  await b.settle(4);
  const firstDrop = {};
  const volleyBatches = new Map();
  for (let t = 0; t <= 4600; t += 40) {
    await b.tick(40); await b.settle(1);
    (await shownHealth()).forEach((hp, i) => { if (hp < 30 && firstDrop[i] === undefined) firstDrop[i] = t; });
    for (const m of await fxBatches()) volleyBatches.set(m.key, m.total);
    if (t === 1240 || t === 1480 || t === 1720 || t === 1960) await shot(`i-volley-${t}`);
  }
  console.log('  first drop of each rival tile (ms):', JSON.stringify(firstDrop), ' batches:', JSON.stringify([...volleyBatches.values()]));
  check('the volley was played: its batch is the length of a cast and four swings', [...volleyBatches.values()].includes(expectedTotal), JSON.stringify([...volleyBatches.values()]));
  const order = [RIVAL_ACTIVE, RIVAL_BENCH_0, RIVAL_BENCH_0 + 1, RIVAL_BENCH_0 + 2];
  const times = order.map((i) => firstDrop[i]);
  check('each rival\'s health drops in the order the engine swung, one after another', times.every((t, k) => t !== undefined && (k === 0 || t > times[k - 1])), JSON.stringify(times));
  const gaps = times.slice(1).map((t, k) => t - times[k]);
  check(`…about ${T.volleyStep} ms apart (a volley, not four attacks)`, gaps.every((g) => g >= T.volleyStep - 80 && g <= T.volleyStep + 80), JSON.stringify(gaps));
  for (let t = 0; t < 6000; t += 100) {
    if (!(await G()).action || (await G()).action.state !== 'begin') break;
    await b.tick(100); await b.settle(1);
  }
  const afterVolley = await G();
  const rivalHp = [afterVolley.players['1'].active, ...afterVolley.players['1'].bench].map((h) => h.hp);
  check('every rival hero took the volley\'s swing', rivalHp.every((hp) => hp < 30), JSON.stringify(rivalHp));
  check('a volley is not the turn\'s attack: it is still to make', afterVolley.attackUsed === false && !afterVolley.players['0'].active.attackedThisTurn);
  // Now the turn's own attack, from the sheet: the choreographer walks it, and the
  // FX layer — which plays the engine's account of a volley — has nothing of it to play.
  for (let t = 0; t < 8000 && (await fxBatches()).length > 0; t += 200) { await b.tick(200); await b.settle(1); }
  check('the volley\'s batch has finished before the attack', (await fxBatches()).length === 0);
  await openSheet(MY_ACTIVE);
  await b.clickEl(`document.querySelector('[aria-label="Hero sheet"] [aria-label^="Attack"]')`, { scroll: false });
  await b.settle(4);
  let walkedAttack = false, attackBatches = 0, g = await G();
  for (let t = 0; t < 9000 && !g.attackUsed; t += 100) {
    await b.tick(100); await b.settle(1);
    walkedAttack = walkedAttack || (await b.evaluate(`!!${byTextStart('Skip')}`));
    attackBatches += (await fxBatches()).length;
    g = await G();
  }
  for (let t = 0; t < 3000; t += 100) { await b.tick(100); await b.settle(1); attackBatches += (await fxBatches()).length; }
  const struck = (await G()).players['1'].active.hp;
  console.log(`  the attack: walked=${walkedAttack}, fx batches while it played and after: ${attackBatches}, rival Active ${rivalHp[0]} -> ${struck}`);
  check('the choreographer walked the turn\'s attack', walkedAttack && g.attackUsed);
  check('…and the FX layer played nothing of it: no fx batch at all (no double play)', attackBatches === 0, `${attackBatches}`);
  check('…the swing still landed once', struck < rivalHp[0], `${rivalHp[0]} -> ${struck}`);
  await shot('i-after-attack');

  // ===== j: Last Stand, set off by the start-of-turn tick ===================================
  console.log('\n(j) Last Stand: the start-of-turn tick strikes every rival hero, and the board plays that batch as a channel pulse');
  await b.tick(2400); await b.settle(2);
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK}
    const bearer = G.players['0'].bench[0];
    bearer.hp = 5; bearer.hpMax = 12; bearer.spiritMod = 2;
    bearer.statuses = [{ id: 'last_stand', value: 4, duration: 1, heal: 3 }];
    G.players['0'].hand = [];
    G.players['1'].hand = []; G.players['1'].souls = 0;
  }`);
  const lsChip = await b.evaluate(`(() => { const chip = ${tile(MY_BENCH_0)}.querySelector('span[data-status="last_stand"]'); return chip ? { mark: chip.querySelector('svg[data-mark="last_stand"]') !== null, text: chip.textContent.trim() } : null; })()`);
  check('the bearer\'s tile prints "Last Stand 4 (1)" behind the rising-charge mark', !!lsChip && lsChip.mark && /^LastStand4\(1\)$/.test(lsChip.text.replace(/\s+/g, '')), JSON.stringify(lsChip));
  await shot('j-before');
  await b.clickEl(endTurn, { js: true, scroll: false });
  await b.settle(3);
  // The rival's turn plays out; the moment it is yours again, the tick has struck.
  let sawRival = false, flipped = false;
  for (let t = 0; t < 90000 && !flipped; t += 100) {
    await b.tick(100); await b.settle(1);
    const who = await b.evaluate(`${CLIENT}.getState().ctx.currentPlayer`);
    if (who === '1') sawRival = true;
    else if (sawRival && who === '0') flipped = true;
    if (!flipped && await b.evaluate(`!!document.querySelector('[aria-label="Choose your new Active"] button')`)) { await b.evaluate(`document.querySelector('[aria-label="Choose your new Active"] button').click()`); await b.settle(3); }
  }
  check('the rival\'s turn played and the turn came back to you', flipped);
  const atFlip = await G();
  const strikeBatches = new Map();
  const shownAtFlip = await shownHealth();
  const rivalAfter = [atFlip.players['1'].active, ...atFlip.players['1'].bench].map((h) => h.hp);
  const bearerNow = atFlip.players['0'].bench[0];
  const dropped = {};
  for (let t = 0; t <= 2400; t += 40) {
    if (t) { await b.tick(40); await b.settle(1); }
    (await shownHealth()).forEach((hp, i) => { if (i <= RIVAL_ACTIVE && hp < 30 && dropped[i] === undefined) dropped[i] = t; });
    for (const m of await fxBatches()) strikeBatches.set(m.key, m.total);
    if (t === 280 || t === 560 || t === 840 || t === 1120) await shot(`j-strike-${t}`);
  }
  console.log('  engine rival HP at the start of the turn:', JSON.stringify(rivalAfter), ' tiles showed:', JSON.stringify(shownAtFlip.slice(0, 4)), ' tiles dropped at (ms):', JSON.stringify(dropped), ' batches:', JSON.stringify([...strikeBatches.values()]));
  check('Last Stand struck every rival hero at the start of the turn (value 4 + the bearer\'s Spirit)', rivalAfter.every((hp) => hp <= 26), JSON.stringify(rivalAfter));
  check('…it is spent, and the log says it went off', !bearerNow.statuses.some((s) => s.id === 'last_stand') && atFlip.log.some((l) => /Last Stand goes off/.test(l.text)), JSON.stringify(atFlip.log.slice(-4).map((l) => l.text)));
  check('the tiles still showed full health when the engine had already struck (the numbers wait for the bolt)', shownAtFlip.slice(0, 4).every((hp) => hp === 30), JSON.stringify(shownAtFlip.slice(0, 4)));
  const drops = [RIVAL_ACTIVE, RIVAL_BENCH_0, RIVAL_BENCH_0 + 1, RIVAL_BENCH_0 + 2].map((i) => dropped[i]);
  check('…and each dropped when the channel\'s strike reached it (after its lead-in, one after another)', drops.every((t, k) => t !== undefined && t >= 250 && (k === 0 || t >= drops[k - 1] - 40)), JSON.stringify(drops));
  check('the batch is played: its length is a channel pulse\'s', [...strikeBatches.values()].some((total) => total >= 1900), JSON.stringify([...strikeBatches.values()]));
  await shot('j-after');

  // ===== k: a number's colour says what it scales with; hovering or tapping it, or a status, explains it ===
  console.log('\n(k) purple numbers and status chips explain themselves: hover on a desktop, tap on a phone');
  const PURPLE = 'rgb(122, 74, 138)'; // poster.stat.spirit
  const PAPER = 'rgb(242, 230, 203)'; // poster.paper, the type on the red skill plate
  const touch = MODE === 'mobile';
  await b.tick(2400); await b.settle(2);
  // A phone is a finger: switch the page to touch (hover: none, pointer: coarse) and tap with real touches.
  if (touch) {
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.settle(3);
    check('the page now reports a touch device (no hover)', await b.evaluate(`!matchMedia('(hover: hover) and (pointer: fine)').matches`));
  } else {
    check('the page reports a device that hovers', await b.evaluate(`matchMedia('(hover: hover) and (pointer: fine)').matches`));
  }
  const touchTap = async (x, y) => {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await b.tick(40); await b.settle(1);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await b.settle(4); await b.tick(120); await b.settle(2);
  };
  const centre = (finder) => b.evaluate(`(() => { const el = (${finder}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  /** Tap an element with a finger (phone) or click it (desktop), wherever it is on screen. */
  const poke = async (finder) => {
    const at = await centre(finder);
    if (!at) throw new Error('poke: not found: ' + finder);
    if (touch) await touchTap(at.x, at.y);
    else { await b.clickAt(at.x, at.y); await b.settle(4); await b.tick(120); await b.settle(2); }
  };
  /** Move the mouse over an element (desktop hover). */
  const hoverOver = async (finder) => {
    const at = await centre(finder);
    if (!at) throw new Error('hoverOver: not found: ' + finder);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await b.settle(4); await b.tick(120); await b.settle(2);
  };
  const hoverAway = async () => { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await b.settle(4); await b.tick(120); await b.settle(2); };
  /** The explanation cards open now: how many, in which mode, what they say, where they sit. */
  const explained = () => b.evaluate(`(() => {
    const els = [...document.querySelectorAll('[data-explain-card]')];
    const r = els[0]?.getBoundingClientRect();
    return { n: els.length, mode: els[0]?.getAttribute('data-explain-card') ?? null, role: els[0]?.getAttribute('role') ?? null,
      text: els.map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).join(' | '),
      box: r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null };
  })()`);
  const SHEET = `document.querySelector('[aria-label="Hero sheet"]')`;
  const sheetOpen = () => b.evaluate(`!!${SHEET}`);
  const closeSheet = async () => { await b.clickEl(byText('Close'), { scroll: false }); await sheetGone(); };
  const onScreen = (box) => !!box && box.l >= 0 && box.r <= W && box.t >= 0 && box.b <= H;
  const press = async (key, code, vk) => {
    await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    await b.settle(4); await b.tick(120); await b.settle(2);
  };
  /** A name on the open sheet: a place to tap that is nothing but paper. */
  const nameOnSheet = (name) => `[...${SHEET}.querySelectorAll('span')].find((s) => s.textContent.trim() === ${JSON.stringify(name)})`;

  // Kelvin with Spirit 2 in front (his skill is 1 spirit damage + Spirit), a Bleed on a hurt bench hero,
  // and a Healing Rite in hand. His skill has been used, so its card is the flat outlined one.
  // (The turn number is left as it is: setting it back would write a second "Turn 2" into the log.)
  await stage(`(G) => { ${PAGE} ${READY_TO_ATTACK.replace('G.turnNumber = 2; ', '')}
    G.players['0'].souls = 10;
    const a = G.players['0'].active; a.cardId = 'hero_kelvin'; a.hp = a.hpMax = 6; a.spiritMod = 2; a.statuses = []; a.attached = []; a.skillUsedThisTurn = true;
    const ben = G.players['0'].bench[0]; ben.hp = 3; ben.statuses = [{ id: 'bleed', value: 2, duration: 2 }];
    G.players['0'].hand = [inst('qa-rite', 'healing_rite'), inst('qa-front', 'cold_front')];
  }`);
  await b.tick(1500); await b.settle(3);
  const BENCH_NAME = await b.evaluate(`${tile(MY_BENCH_0)}.getAttribute('aria-label').split(' — ')[0]`);
  await openSheet(MY_ACTIVE);
  const NUM = `${SHEET}.querySelector('[data-scales="sp"]')`;
  const numInfo = await b.evaluate(`(() => { const n = ${NUM}; if (!n) return null; const s = getComputedStyle(n); return { text: n.textContent.trim(), color: s.color, bg: s.backgroundColor }; })()`);
  console.log('  skill number:', JSON.stringify(numInfo));
  check('Kelvin\'s skill prints 3 (his 1 + his Spirit 2) in purple on the sheet', numInfo?.text === '3' && numInfo.color === PURPLE, JSON.stringify(numInfo));
  check('…the sheet shows no raw markup', !/\{sp:|\{bp:/.test(await sheetText()), (await sheetText()).slice(0, 200));
  await shot('k-sheet-before');

  if (!touch) {
    await hoverOver(NUM);
    const tip = await explained();
    console.log('  tooltip:', JSON.stringify(tip));
    check('hovering the purple number shows a tooltip: "1 + Kelvin\'s Spirit Power 2 = 3"', tip.n === 1 && tip.role === 'tooltip' && tip.mode === 'hover' && /1 \+ Kelvin's Spirit Power 2 = 3/.test(tip.text), tip.text);
    check('…it says what the colour means', /Purple numbers grow with Spirit Power/.test(tip.text), tip.text);
    check('…and sits on the screen', onScreen(tip.box), JSON.stringify(tip.box));
    await shot('k-sheet-tooltip');
    await hoverAway();
    check('moving off it hides the tooltip', (await explained()).n === 0);
    // Keyboard: a focus that came from the keyboard shows it, and blurring hides it.
    await press('Shift', 'ShiftLeft', 16);
    await b.evaluate(`${NUM}.closest('[data-explain]').focus()`);
    await b.settle(3);
    check('keyboard-focusing the number shows the tooltip', (await explained()).n === 1 && (await explained()).role === 'tooltip');
    await b.evaluate(`document.activeElement.blur()`);
    await b.settle(3);
    check('…and leaving it hides it', (await explained()).n === 0);
  } else {
    await poke(NUM);
    const pop = await explained();
    console.log('  popup:', JSON.stringify(pop));
    check('tapping the purple number opens a popup card: "1 + Kelvin\'s Spirit Power 2 = 3"', pop.n === 1 && pop.role === 'dialog' && pop.mode === 'touch' && /1 \+ Kelvin's Spirit Power 2 = 3/.test(pop.text), pop.text);
    check('…it stays on screen at 390 px', onScreen(pop.box), JSON.stringify(pop.box));
    check('…and the sheet is still up', await sheetOpen());
    await shot('k-sheet-popup');
    // Tapping anywhere else closes it — here, the card's name band.
    await poke(nameOnSheet('Kelvin'));
    check('a tap anywhere else closes it (the sheet stays)', (await explained()).n === 0 && await sheetOpen());
    // Escape closes it first, and only it.
    await poke(NUM);
    check('(open again)', (await explained()).n === 1);
    await press('Escape', 'Escape', 27);
    check('Escape closes the popup and leaves the sheet up', (await explained()).n === 0 && await sheetOpen());
    await press('Escape', 'Escape', 27);
    await sheetGone();
    check('a second Escape closes the sheet', !(await sheetOpen()));
    await openSheet(MY_ACTIVE);
  }
  await closeSheet();

  // The same number on the red plate (the skill can be used): the colour moves to the number's ground,
  // and a tap on it is the popup's, not the plate's — the skill is not used.
  await stage(`(G) => { const a = G.players['0'].active; a.skillUsedThisTurn = false; a.attackedThisTurn = false; }`);
  await openSheet(MY_ACTIVE);
  const plateNum = await b.evaluate(`(() => { const n = ${NUM}; if (!n) return null; const s = getComputedStyle(n); return { text: n.textContent.trim(), color: s.color, bg: s.backgroundColor }; })()`);
  console.log('  number on the plate:', JSON.stringify(plateNum));
  check('on the red skill plate the number is cream on a purple ground', plateNum?.text === '3' && plateNum.bg === PURPLE && plateNum.color === PAPER, JSON.stringify(plateNum));
  await shot('k-sheet-plate');
  if (touch) {
    const before = await G();
    await poke(NUM);
    const onPlate = await explained();
    const after = await G();
    check('tapping the number on the plate opens its popup and does not use the skill', onPlate.n === 1 && !after.players['0'].active.skillUsedThisTurn && after.players['0'].souls === before.players['0'].souls && await sheetOpen(), `${onPlate.text} used ${after.players['0'].active.skillUsedThisTurn}`);
    await poke(nameOnSheet('Kelvin'));
    check('(a tap elsewhere closes it)', (await explained()).n === 0);
  }
  await closeSheet();

  // One at a time, and a status word in card text explains the status: Seven's skill has Stun in it.
  await stage(`(G) => { const a = G.players['0'].active; a.cardId = 'hero_seven'; a.hp = a.hpMax = 4; a.spiritMod = 1; a.skillUsedThisTurn = true; }`);
  await openSheet(MY_ACTIVE);
  const STUN = `[...${SHEET}.querySelectorAll('[data-explain]')].find((e) => e.textContent.trim() === 'Stun')`;
  const SEVEN_NUM = `${SHEET}.querySelector('[data-scales="sp"]').closest('[data-explain]')`;
  if (!touch) {
    await hoverOver(STUN);
    const st = await explained();
    check('hovering "Stun" in Seven\'s text says what Stun does', st.n === 1 && /stun/i.test(st.text) && /Cannot act, attack, or use skills\./.test(st.text), st.text);
    await shot('k-keyword-tooltip');
    await hoverAway();
  } else {
    await poke(SEVEN_NUM);
    const first = await explained();
    check('Seven: the number is open ("1 + Seven\'s Spirit Power 1 = 2")', first.n === 1 && /1 \+ Seven's Spirit Power 1 = 2/.test(first.text), first.text);
    await poke(STUN);
    const st = await explained();
    check('tapping "Stun" opens its popup and closes the number\'s: one at a time', st.n === 1 && /Cannot act, attack, or use skills\./.test(st.text) && !/Spirit Power/.test(st.text), st.text);
    check('…it stays on screen at 390 px', onScreen(st.box), JSON.stringify(st.box));
    await shot('k-keyword-popup');
    await poke(nameOnSheet('Seven'));
    check('(a tap elsewhere closes it)', (await explained()).n === 0);
  }
  await closeSheet();

  // A spell in hand prints its own number; its explanation says whose Spirit is behind it and what it is now.
  // (Seven, in front, has Spirit 1.) On a phone a tap on a card in the fan is the card's: it arms, no popup.
  const HAND_NUM = `(${HAND}).find((c) => c.getAttribute('aria-label').startsWith('Cold Front')).querySelector('[data-scales="sp"]')`;
  const handNum = await b.evaluate(`(() => { const n = ${HAND_NUM}; if (!n) return null; const s = getComputedStyle(n); return { text: n.textContent.trim(), color: s.color }; })()`);
  check('Cold Front in hand prints its own 4, in purple (not the live 5)', handNum?.text === '4' && handNum.color === PURPLE, JSON.stringify(handNum));
  if (!touch) {
    await hoverOver(HAND_NUM);
    const handTip = await explained();
    check('hovering it says "4 + your Active\'s Spirit Power (1 now)"', handTip.n === 1 && /4 \+ your Active's Spirit Power \(1 now\)/.test(handTip.text), handTip.text);
    await shot('k-hand-tooltip');
    await hoverAway();
  } else {
    await poke(HAND_NUM);
    await b.tick(500); await b.settle(3);
    check('a tap on its number arms the card (the tap is the card\'s) and opens no popup', /Enemy Active/.test(await text()) && (await explained()).n === 0, (await explained()).text);
    await press('Escape', 'Escape', 27);
    await b.tick(500); await b.settle(3);
    check('(Escape disarms it)', !/Enemy Active/.test(await text()));
  }

  // A status chip on a tile.
  const CHIP = `${tile(MY_BENCH_0)}.querySelector('[data-status="bleed"]')`;
  if (!touch) {
    await hoverOver(CHIP);
    const chip = await explained();
    console.log('  chip tooltip:', JSON.stringify(chip));
    check('hovering the Bleed chip on a tile shows its title, its text with the value filled in, and the turns left', chip.n === 1 && /bleed/i.test(chip.text) && /Take 2 Pure dmg at start of turn/.test(chip.text) && /2 turns left/.test(chip.text), chip.text);
    await shot('k-chip-tooltip');
    await poke(CHIP);
    await b.tick(900); await b.settle(3);
    check('a click on the chip still opens the hero sheet', await sheetOpen() && new RegExp(BENCH_NAME, 'i').test(await sheetText()), (await sheetText()).slice(0, 80));
    await closeSheet();
    await hoverAway();
  } else {
    await poke(CHIP);
    const chip = await explained();
    console.log('  chip popup:', JSON.stringify(chip));
    check('tapping the Bleed chip on a tile opens its popup, not the hero sheet', chip.n === 1 && chip.mode === 'touch' && /bleed/i.test(chip.text) && /Take 2 Pure dmg at start of turn/.test(chip.text) && /2 turns left/.test(chip.text) && !(await sheetOpen()), chip.text);
    check('…it stays on screen at 390 px', onScreen(chip.box), JSON.stringify(chip.box));
    await shot('k-chip-popup');
    await touchTap(Math.round(W / 2), 2); // the very top of the page: nothing there to take the tap
    check('a tap elsewhere closes it', (await explained()).n === 0);
    // The tile off its chips still opens its sheet.
    await b.clickEl(tile(MY_BENCH_0), { scroll: false });
    await b.settle(4); await b.tick(900); await b.settle(3);
    check('a tap on the tile (off its chips) still opens the sheet', await sheetOpen());
    await closeSheet();
  }

  // With a card armed, every tap on the tile picks the target — the chip's included.
  await b.tick(1500); await b.settle(2);
  await b.clickEl(handCard('Healing Rite'), { scroll: false });
  await b.settle(4); await b.tick(500); await b.settle(3);
  check('Healing Rite is armed (the banner is up)', /Ally Hero/.test(await text()));
  await poke(CHIP);
  await b.tick(2400); await b.settle(3);
  const armedAfter = await G();
  const armedCard = await explained();
  check('a tap on the chip with a card armed targets the tile: the card was played on it', !armedAfter.players['0'].hand.some((c) => c.iid === 'qa-rite') && armedAfter.players['0'].discard.some((c) => c.iid === 'qa-rite'), `hand ${armedAfter.players['0'].hand.map((c) => c.iid)}`);
  check('…no popup opened and no sheet', armedCard.role !== 'dialog' && !(await sheetOpen()), JSON.stringify(armedCard));
  await shot('k-armed-tap-targets');
  if (touch) { await b.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await b.settle(3); }
} finally {
  const errors = b.errors.filter((e) => !ALLOWED_WARNINGS.some((re) => re.test(e)));
  console.log('\npage errors (React warnings included):', errors.length ? errors.slice(0, 10).map((e) => e.slice(0, 300)) : 'none');
  if (errors.length) results.push({ name: 'page errors', ok: false });
  await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; FAILED: ${failed.map((r) => r.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
