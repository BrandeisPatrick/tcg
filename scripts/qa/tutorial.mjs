/**
 * Tutorial playtest — walk a lesson end to end the way a player would: at
 * every step, find what the gate lets you touch (the pulsing gold frames),
 * click it for real (CDP mouse events, with an elementFromPoint hit probe),
 * and tick the virtual clock while something plays out. Stops on the match
 * result. A lesson is a single path through real game state — soul refills,
 * rival turns, reveals, combat FX — so only a full walk proves it is
 * walkable.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa/tutorial.mjs OUT_DIR [PORT] [desktop|mobile] [skill|souls|level|bench|all]
 */
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? './tutorial-shots');
const PORT = Number(process.argv[3] ?? 9337);
const MODE = process.argv[4] ?? 'desktop';
const WHICH = process.argv[5] ?? 'all';
const LESSONS = WHICH === 'all' ? ['skill', 'souls', 'level', 'bench'] : [WHICH];
mkdirSync(OUT, { recursive: true });
const W = MODE === 'mobile' ? 390 : 1440, H = MODE === 'mobile' ? 844 : 900;

// What the page looks like to a player right now: the coach's words, the
// frames the gate has lit as tappable, and whether the match is over.
const LOOK = `(() => {
  const coach = document.querySelector('[aria-label="Tutorial"]');
  const text = coach ? coach.innerText.replace(/\\s+/g, ' ').trim() : '';
  const gold = 'rgb(217, 182, 74)';
  const rings = [...document.querySelectorAll('div[aria-hidden="true"]')]
    // The tappable frames are the 2.5px ones (read off the inline style: a
    // computed border width is snapped to whole device pixels).
    .filter((d) => d.style.position === 'fixed' && d.style.borderRadius === '12px' && d.style.borderTopWidth === '2.5px' && getComputedStyle(d).borderTopColor === gold)
    .map((d) => { const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  const taps = [...document.querySelectorAll('[role="button"][aria-label="Continue"]')]
    .map((d) => { const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  const over = [...document.querySelectorAll('*')].some((e) => e.children.length === 0 && /^(Victory|Defeat|Draw)$/.test(e.textContent.trim()));
  return { text, rings, taps, over, headline: over ? [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^(Victory|Defeat|Draw)$/.test(e.textContent.trim())).textContent.trim() : null };
})()`;
const UNDER = (x, y) => `(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return 'nothing'; const b = e.closest('button, [role="button"]'); const t = b ?? e; return (t.getAttribute('aria-label') || t.textContent || t.tagName).replace(/\\s+/g, ' ').trim().slice(0, 40); })()`;

const b = await launch({ port: PORT, width: W, height: H, scale: MODE === 'mobile' ? 2 : 1 });
let failed = false;
try {
  for (const id of LESSONS) {
    await b.navigate(`${DEV_URL}/?lesson=${id}&vtclock=1`);
    await b.waitFor(`document.querySelector('[aria-label="Tutorial"]')`, { timeout: 20000 });
    await b.tick(600); await b.settle(3);
    console.log(`\n=== lesson ${id} (${MODE}) ===`);
    let last = '', clicks = 0, idle = 0, shots = 0, result = null;
    for (let i = 0; i < 700 && !result; i++) {
      const s = await b.evaluate(LOOK);
      if (s.over) { result = s.headline; break; }
      if (s.text !== last) { console.log('  coach:', s.text.slice(0, 150)); last = s.text; }
      const target = s.rings[0] ?? s.taps[0];
      // "Now tap <a hero on the board>": the hero sheet the skill was picked
      // from is still fading out (its exit starts late under the virtual
      // clock) and would eat the tap. Wait it out, as a player's hand does.
      if (target && /Now tap/.test(s.text) && await b.evaluate(`!!document.querySelector('[aria-label="Hero sheet"]')`)) {
        await b.tick(150); await b.settle(2);
        continue;
      }
      if (target) {
        const under = await b.evaluate(UNDER(target.x, target.y));
        await b.clickAt(target.x, target.y);
        clicks++; idle = 0;
        console.log(`    click #${clicks} (${Math.round(target.x)},${Math.round(target.y)}) → ${under}`);
        await b.settle(4); await b.tick(350); await b.settle(2);
        if (shots < 40 && clicks % 3 === 0) { await b.shot(join(OUT, `${MODE}-${id}-${String(shots++).padStart(2, '0')}.png`)); }
      } else {
        idle++;
        await b.tick(250); await b.settle(2);
        // Film a little of whatever is playing out (a rival turn, combat).
        if (idle % 6 === 3 && shots < 40) await b.shot(join(OUT, `${MODE}-${id}-${String(shots++).padStart(2, '0')}.png`));
        if (idle > 240) { console.log('  STUCK: nothing tappable for 60 s of game time'); break; }
      }
    }
    await b.tick(1500); await b.settle(2);
    await b.shot(join(OUT, `${MODE}-${id}-end.png`));
    console.log(`  result: ${result ?? 'NO RESULT'}  (${clicks} clicks)`);
    if (result !== 'Victory') failed = true;
  }
  // React's dev-only warnings are noise here; anything else is a failure.
  const errors = b.errors.filter((e) => !/^\[console\.(error|warning)\] Warning: /.test(e));
  console.log('\npage errors:', errors.length ? errors.slice(0, 10).map((e) => e.slice(0, 300)) : 'none');
  if (errors.length) failed = true;
} finally {
  await b.close();
}
process.exit(failed ? 1 : 0);
