/**
 * Full-match playtest — draft a real match, switch Auto on so the AI plays
 * both seats, and tick the virtual clock until the result sheet. Reads the
 * turn dial, the mover's attack lamp and the turn button on the way, so it
 * reports every state the turn flow went through (whose move, which phase,
 * whether the turn's attack was still to make, what the button offered) and
 * stops with a failure if the match sits still for a minute of game time.
 * The lessons walk four short scripted fights; this is the long way round:
 * draws, promotions, respawns, ultimates and a real ending.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/match.mjs OUT_DIR [PORT] [desktop|mobile]
 */
import { launch, byText } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? './match-shots');
const PORT = Number(process.argv[3] ?? 9339);
const MODE = process.argv[4] ?? 'desktop';
mkdirSync(OUT, { recursive: true });
const W = MODE === 'mobile' ? 390 : 1440, H = MODE === 'mobile' ? 844 : 900;

const TICK_MS = 400;
/** Game time the dial may stand still before the match counts as wedged. */
const STALL_TICKS = 60_000 / TICK_MS;
const MAX_TICKS = 3000;

const lockIn = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Lock In'))`;
// The turn button — it only ever ends the turn; attacks are made from the
// Active's sheet (here, by the AI through the same path).
const turnButton = `document.querySelector('[aria-label="End Turn"]')`;
// The mover's patron lamp says whether the turn's attack is still to make:
// "Ready to attack" or "No attack left this turn" (the other seat's lamp
// reads "Waiting for its turn").
const LAMPS = ['Ready to attack', 'No attack left this turn'];
const LOOK = `(() => {
  const dial = document.querySelector('[aria-label^="Turn "]');
  const over = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^(Victory|Defeat|Draw)$/.test(e.textContent.trim()));
  const btn = ${turnButton};
  const lamp = [...document.querySelectorAll('[role="img"][aria-label]')].map((e) => e.getAttribute('aria-label')).find((l) => ${JSON.stringify(LAMPS)}.includes(l));
  return {
    dial: dial ? dial.getAttribute('aria-label') : null,
    over: over ? over.textContent.trim() : null,
    button: btn ? btn.getAttribute('aria-label') + (btn.disabled ? ' (off)' : '') : null,
    lamp: lamp ?? null,
  };
})()`;

const b = await launch({ port: PORT, width: W, height: H, scale: MODE === 'mobile' ? 2 : 1 });
let failed = false;
try {
  await b.navigate(`${DEV_URL}/?screen=match&vtclock=1`);
  await b.waitFor(`document.querySelector('[aria-label^="Select "]')`, { timeout: 20000 });
  // ---- Draft: take the first hero on offer whenever Lock is live; tick for the AI in between.
  for (let i = 0; i < 80; i++) {
    const st = await b.evaluate(`(() => {
      const lock = ${byText('Lock')};
      return { draft: !!document.querySelector('[aria-label^="Select "]') || !!lock, live: !!lock && !lock.disabled, mulligan: !!${lockIn}, board: !!${turnButton} };
    })()`);
    if (st.mulligan || (!st.draft && st.board)) break;
    if (st.live) {
      await b.evaluate(`document.querySelector('[aria-label^="Select "]').click()`);
      await b.settle(3);
      await b.clickEl(byText('Lock'), { js: true, scroll: false });
      await b.settle(3);
    }
    await b.tick(TICK_MS); await b.settle(2);
  }
  if (await b.evaluate(`!!${lockIn}`)) { await b.clickEl(lockIn, { js: true, scroll: false }); await b.settle(3); }
  await b.waitFor(turnButton, { timeout: 8000 });
  await b.tick(600); await b.settle(2);
  await b.shot(join(OUT, `${MODE}-start.png`));

  await b.clickEl(byText('Auto'), { js: true, scroll: false });
  await b.settle(3);

  // ---- Let it play. Every distinct (mover, phase, attack, button) is a state the turn flow reached.
  const states = new Set();
  let result = null, lastDial = '', still = 0, attacks = 0;
  for (let i = 0; i < MAX_TICKS && !result; i++) {
    await b.tick(TICK_MS); await b.settle(2);
    const s = await b.evaluate(LOOK);
    if (s.over) { result = s.over; break; }
    if (!s.dial) continue;
    const m = s.dial.match(/^Turn \d+ · (.+?) · (\w+) phase/);
    if (m) states.add(`${m[1]} · ${m[2]} · ${s.lamp ?? 'attack: —'} · button: ${s.button}`);
    if (s.dial === lastDial) {
      if (++still > STALL_TICKS) {
        console.log(`STUCK for a minute of game time at "${s.dial}", button: ${s.button}`);
        await b.shot(join(OUT, `${MODE}-stuck.png`));
        break;
      }
      continue;
    }
    lastDial = s.dial; still = 0;
    // Film the first few attacks as they are walked.
    if (/Battle phase/.test(s.dial) && attacks < 6) await b.shot(join(OUT, `${MODE}-attack-${++attacks}.png`));
  }
  await b.tick(1500); await b.settle(2);
  await b.shot(join(OUT, `${MODE}-end.png`));

  console.log(`result: ${result ?? 'NO RESULT'}  (last dial: ${lastDial})`);
  console.log('turn states reached:\n  ' + [...states].sort().join('\n  '));
  if (!result) failed = true;
  // React's dev-only warnings are noise here; anything else is a failure.
  const errors = b.errors.filter((e) => !/^\[console\.(error|warning)\] Warning: /.test(e));
  console.log('page errors:', errors.length ? errors.slice(0, 10).map((e) => e.slice(0, 300)) : 'none');
  if (errors.length) failed = true;
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
