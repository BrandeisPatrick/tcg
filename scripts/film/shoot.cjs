// The trailer's takes (docs/sharing.md, "The video"). Each is one browser
// session, filmed on the virtual clock to its own folder of frames:
//   FPS=60 node scripts/film/shoot.cjs <take> [outBase=takes]
// takes: title | match | lesson | screens | end
// shoot-all.sh films all five, encodes them and joins them.
//
// SEED pins Math.random (lib.cjs), so the rival drafts the same heroes and
// the same match plays out each time: seed 7 is a win in twelve turns with a
// hero knocked out and drawn back. Another seed is another match; watch it
// through before keeping it. The captions are the strings below.
//
// Not shown, on purpose: the title screen and the lessons list. The
// tutorial's cover is on both, and it needs its artist's OK first.
const { open } = require('./lib.cjs');
const fs = require('fs');
const take = process.argv[2];
const base = process.argv[3] || 'takes';
const fps = Number(process.env.FPS || 30);
const SEED = Number(process.env.SEED || 7);
const dir = `${base}/${take}`;
fs.rmSync(dir, { recursive: true, force: true });
const log = (...a) => console.log(`[${take}]`, ...a);

const SITE = 'brandeispatrick.github.io/tcg';

/* ---------------------------------------------------------------- */
/* The title and the end card: the link preview's card on the dark   */
/* ground, slowly pushed in.                                         */
/* ---------------------------------------------------------------- */
async function card(film, { ms, scale, lift = 0, foot = null }) {
  const p = film.page;
  await film.go('?share=1');
  await p.addStyleTag({ content: `
    html, body { margin: 0; height: 100%; overflow: hidden; background: radial-gradient(120% 95% at 50% 38%, #1a242c 0%, #0c1116 62%, #07090c 100%); }
    #root { height: 100%; display: flex; align-items: center; justify-content: center; }
    #link-preview { border-radius: 22px; box-shadow: 0 44px 90px rgba(0,0,0,.62), 0 10px 26px rgba(0,0,0,.42) !important; transform: translateY(var(--lift, 0px)) scale(var(--z, 1)); }
    #foot { position: fixed; left: 0; right: 0; bottom: 34px; text-align: center; color: #f2e6cb; }
    #foot b { display: block; font: 400 40px/1 'Saira Stencil One', Impact, sans-serif; letter-spacing: .06em; }
    #foot span { display: block; margin-top: 14px; font: 600 15px/1 'Saira Variable', 'Saira', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #b9ae96; }
  ` });
  if (foot) await p.evaluate(([url, line]) => { const f = document.createElement('div'); f.id = 'foot'; f.innerHTML = `<b>${url}</b><span>${line}</span>`; document.body.appendChild(f); }, foot);
  // Polled on a timer: the default polls on animation frames, and the virtual clock holds those.
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), undefined, { polling: 100, timeout: 10000 });
  const frames = Math.round(ms / (1000 / fps));
  let i = 0;
  film.onFrame(async () => {
    const t = Math.min(1, i++ / frames);
    await p.evaluate(([z, lift]) => { const el = document.getElementById('link-preview'); el.style.setProperty('--z', z); el.style.setProperty('--lift', lift + 'px'); }, [(scale + 0.035 * t).toFixed(4), lift]);
  });
}

async function title() {
  const film = await open({ fps, out: dir, view: { width: 1280, height: 720 }, dpr: 1.5 });
  await card(film, { ms: 2800, scale: 0.94 });
  film.black(); film.fade(0, 450);
  await film.roll(2500);
  film.fade(1, 260);
  await film.roll(300);
  log('frames', film.frames);
  await film.close();
}

async function end() {
  const film = await open({ fps, out: dir, view: { width: 1280, height: 720 }, dpr: 1.5 });
  await card(film, { ms: 4200, scale: 0.8, lift: -52, foot: [SITE, 'Free · in your browser · unofficial fan project'] });
  film.black(); film.fade(0, 350);
  await film.roll(3800);
  film.fade(1, 400);
  await film.roll(450);
  log('frames', film.frames);
  await film.close();
}

/* ---------------------------------------------------------------- */
/* The draft, the deck draft and a whole match on Auto.              */
/* ---------------------------------------------------------------- */
async function match() {
  const film = await open({ fps, out: dir, seed: SEED });
  const p = film.page;
  await film.go('?screen=match');
  await film.skip(1000);

  // --- Draft three heroes -------------------------------------------------
  film.black(); film.fade(0, 260);
  film.caption('Draft\nthree heroes', { sub: '22 to choose from', top: 580 });
  await film.roll(650);
  const WANT = ['Abrams', 'Vindicta', 'Lady Geist', 'Haze', 'Kelvin', 'Yamato'];
  const myPick = () => [...document.querySelectorAll('button')].some((x) => (x.getAttribute('aria-label') || '').startsWith('Select ') && !x.disabled) && !document.querySelector('[aria-label="Draft your deck"]');
  for (let pick = 0; pick < 3; pick++) {
    await film.rollUntil(myPick, undefined, 15000, 1.6);
    const free = await p.locator('button[aria-label^="Select "]').evaluateAll((els) => els.filter((e) => !e.disabled).map((e) => e.getAttribute('aria-label').slice(7)));
    const hero = WANT.find((h) => free.includes(h));
    log('pick', pick + 1, hero);
    await film.click(p.getByRole('button', { name: `Select ${hero}`, exact: true }), { roll: true });
    await film.roll(760);
    await film.click(p.getByRole('button', { name: /^Lock/ }).first(), { roll: true });
    // The last lock opens the deck draft: the words go before it does.
    if (pick === 2) film.caption(null);
    await film.roll(pick === 2 ? 300 : 430);
  }
  await film.rollUntil(() => !!document.querySelector('[aria-label="Draft your deck"]'), undefined, 8000, 1.6);
  log('draft done at frame', film.frames);

  // --- Pick a deck ---------------------------------------------------------
  film.caption('Then pick\na deck', { sub: "built from Deadlock's item shop", top: 300 });
  await film.roll(1000);
  const offers = await p.locator('[aria-label="Decks"] [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  log('offers', offers);
  // Look at the second offer, then take the squad's own.
  const second = p.locator('[aria-label="Decks"] [aria-label]').nth(1);
  await film.click(second, { roll: true });
  await film.roll(850);
  await film.click(p.locator('[aria-label^="Your deck"]').first(), { roll: true });
  await film.roll(950);
  // Cut on the press: the match opens the next shot.
  film.caption(null);
  await film.click(p.getByRole('button', { name: /^Play/ }).first(), { roll: true });
  log('deck done at frame', film.frames);

  // --- The match -------------------------------------------------------------
  await film.until(() => !!document.querySelector('[aria-label="Choose your Active"], [aria-label="Choose your first Active"]'));
  await film.skip(700);
  await film.click(p.getByRole('button', { name: /^Start with/ }).first());
  film.caption('Spend souls\non items', { sub: 'equipment stays on, spells are one-shot', top: 290 });
  await film.roll(2300);
  await film.click(p.getByRole('button', { name: /Auto/ }).first(), { roll: true });
  log('auto on at frame', film.frames);
  const over = () => [...document.querySelectorAll('h1')].some((h) => /Victory|Defeat/.test(h.textContent || ''));
  await film.roll(9000, 1.5);
  film.caption('One lane.\nSkills and\nultimates.', { sub: 'your Active fights, the bench waits', top: 290 });
  await film.rollUntil(over, undefined, 34000, 4);
  film.caption('Fell their\nPatron to win', { sub: 'every kill pushes their structures', top: 290 });
  const done = await film.rollUntil(over, undefined, 40000, 1.5);
  log('over', done, 'at frame', film.frames);
  film.caption(null);
  await film.roll(1700);
  film.fade(1, 220);
  await film.roll(240);
  log('frames', film.frames);
  await film.close();
}

/* ---------------------------------------------------------------- */
/* A tutorial lesson, tap by tap: Level Up (the ultimate).           */
/* ---------------------------------------------------------------- */
async function lesson() {
  const film = await open({ fps, out: dir, seed: SEED });
  const p = film.page;
  await film.go('?lesson=6');
  const stepLive = (k) => { const a = document.querySelector('aside[aria-label="Tutorial"]'); if (!a) return false; const pips = a.querySelector('[role="img"]')?.getAttribute('aria-label') || ''; return pips.startsWith(`Step ${k} `) && /Tap/i.test(a.textContent || ''); };
  await film.until(stepLive, 1, 15000);
  await film.skip(500);
  film.black(); film.fade(0, 240);
  film.caption('Learn it in\n8 short lessons', { sub: 'one tap a step', top: 290 });
  await film.roll(1500);
  const taps = [
    p.locator('[aria-label^="Extra Health, in your hand"]').first(),
    p.locator('[aria-label^="Warden —"]').first(),
    p.locator('[aria-label^="Warden —"]').first(),
    p.locator('[aria-label="Hero sheet"]').locator('[role="button"], button').filter({ hasText: 'Last Stand' }).first(),
    p.locator('[aria-label^="Lash —"]').first(),
  ];
  for (let i = 0; i < taps.length; i++) {
    await film.rollUntil(stepLive, i + 1, 12000, 1.15);
    await film.roll(i === 0 ? 300 : 620, 1.15);
    await film.click(taps[i], { roll: true });
    log('tap', i + 1, 'at frame', film.frames);
  }
  const over = () => [...document.querySelectorAll('h1')].some((h) => /Victory|Defeat/.test(h.textContent || ''));
  await film.rollUntil(over, undefined, 15000, 1.15);
  film.caption(null);
  await film.roll(2000);
  film.fade(1, 220);
  await film.roll(240);
  log('frames', film.frames);
  await film.close();
}

/* ---------------------------------------------------------------- */
/* Three quick looks: the loadout, the story, the gallery.           */
/* ---------------------------------------------------------------- */
async function screens() {
  const film = await open({ fps, out: dir, seed: SEED });
  const p = film.page;
  const looks = [
    ['?screen=loadout', 'Build your own deck', '8 ready decks, or the whole item shop'],
    ['?screen=story', 'A story run across New York', 'recruit heroes, three routes, three bosses'],
    ['?preview=1', '22 heroes · 150+ item cards', "every one under its Deadlock name"],
  ];
  for (const [k, [url, text, sub]] of looks.entries()) {
    await film.go(url);
    await film.skip(1600);
    await p.waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().top < 1200).every((i) => i.complete), undefined, { polling: 100, timeout: 10000 }).catch(() => {});
    if (k === 0) { film.black(); film.fade(0, 240); }
    film.caption(text, { mode: 'plate', sub });
    let y = 0;
    // A slow drift down the page, so a still screen is not a still frame.
    film.onFrame(async () => { y += 60 / fps * 0.9; await p.evaluate((y) => { document.scrollingElement.scrollTop = y; }, y); });
    await film.roll(k === looks.length - 1 ? 2100 : 2300);
    if (k === looks.length - 1) { film.fade(1, 220); await film.roll(240); }
    film.onFrame(null);
    log(url, 'at frame', film.frames);
  }
  log('frames', film.frames);
  await film.close();
}

({ title, end, match, lesson, screens })[take]().catch((e) => { console.error(e); process.exit(1); });
