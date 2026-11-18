// Filming the game frame by frame on its virtual clock (?vtclock=1): the page's
// time only moves when we tick it, so every frame is exact and the video is
// smooth however slow the machine is. shoot.cjs is the trailer made with it;
// docs/sharing.md, "The video", says what the trailer shows.
//
// Needs Playwright (with its Chromium) and, to encode, ffmpeg. Neither is a
// dependency of this repository: a Claude Code cloud session has both; on
// another machine, `npx playwright install chromium` and an ffmpeg with
// libx264. The QA scripts' own driver (scripts/qa/cdp.mjs) would do as well;
// this was written where Playwright was at hand.
//
//   const film = await open({ fps: 60, out: 'frames/draft' });
//   await film.go('?screen=match');
//   await film.roll(1500);              // film 1.5 s of game time
//   await film.click(locator);          // a real click, then let React commit
//   await film.skip(3000);              // let 3 s pass unfilmed (a cut)
//   await film.close();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/** The dev server (`npm run dev`); DEV_URL when it is not on 5173. */
const BASE = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '') + '/';
/** 1600 x 900 CSS at 1.2x is 1920 x 1080 pixels: the desktop layout, with room
 *  for the wide board's patron lines (at 1280 wide their labels overlap). */
const VIEW = { width: 1600, height: 900 };
const DPR = 1.2;

// The caption, outside React's root so no render removes it. Two looks:
//   side   big stencil words in the dark margin left of the board (the match
//          and the drafts leave it empty), with a small line under them;
//   plate  an ink plate at the foot, for the full-width paper screens.
// Its words, look, place and opacity are set per frame by the script.
const CAPTION_JS = `
(() => {
  const make = () => {
    if (document.getElementById('__cap')) return;
    const el = document.createElement('div');
    el.id = '__cap';
    el.innerHTML = '<i></i><b></b><span></span>';
    el.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;opacity:0;';
    document.body.appendChild(el);
    const fade = document.createElement('div');
    fade.id = '__fade';
    fade.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;background:#000;opacity:0;';
    document.body.appendChild(fade);
  };
  if (document.body) make(); else document.addEventListener('DOMContentLoaded', make);
  const STENCIL = "'Saira Stencil One','Saira Variable',Impact,sans-serif";
  const UI = "'Saira Variable','Saira',sans-serif";
  window.__capSet = (c) => {
    make();
    const el = document.getElementById('__cap');
    const [bar, head, sub] = el.children;
    const key = JSON.stringify([c.text, c.sub, c.mode, c.top]);
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      head.innerHTML = String(c.text || '').split('\\n').map((l) => l.replace(/[<&]/g, '')).join('<br>');
      sub.textContent = c.sub || '';
      if (c.mode === 'plate') {
        el.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;left:50%;bottom:30px;transform:translateX(-50%);'
          + 'padding:12px 28px 13px;background:#171410;border:2px solid #f2e6cb;box-shadow:0 0 0 2px #171410,0 14px 34px rgba(0,0,0,.55);white-space:nowrap;text-align:center;';
        bar.style.cssText = 'display:none';
        head.style.cssText = 'display:block;font:400 30px/1 ' + STENCIL + ';letter-spacing:.07em;text-transform:uppercase;color:#f2e6cb;';
        sub.style.cssText = c.sub ? 'display:block;margin-top:9px;font:600 16px/1 ' + UI + ';letter-spacing:.16em;text-transform:uppercase;color:#b9ae96;' : 'display:none';
      } else {
        el.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;left:46px;top:' + (c.top || 300) + 'px;width:330px;';
        bar.style.cssText = 'display:block;width:46px;height:5px;background:#d4392c;margin-bottom:16px;';
        head.style.cssText = 'display:block;font:400 40px/1.08 ' + STENCIL + ';letter-spacing:.03em;text-transform:uppercase;color:#f2e6cb;text-shadow:0 2px 14px rgba(0,0,0,.6);';
        sub.style.cssText = c.sub ? 'display:block;margin-top:14px;font:600 17px/1.35 ' + UI + ';letter-spacing:.14em;text-transform:uppercase;color:#b9ae96;' : 'display:none';
      }
    }
    el.style.opacity = String(c.opacity);
    // Side captions slide in a little from the left as they fade.
    if (c.mode !== 'plate') el.style.transform = 'translateX(' + (-(1 - c.opacity) * 14).toFixed(1) + 'px)';
    document.getElementById('__fade').style.opacity = String(c.black || 0);
  };
})();
`;

// Math.random pinned to a seeded generator (mulberry32): the rival's draft
// picks and the match's own seed come from it, so a take can be made again.
const seededRandom = (seed) => `
(() => {
  let a = ${seed} >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
`;

async function open({ fps = 60, out, quality = 94, seed, view = VIEW, dpr = DPR } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  await ctx.addInitScript(CAPTION_JS);
  if (seed !== undefined) await ctx.addInitScript(seededRandom(seed));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGE ERROR', String(e).slice(0, 200)); });
  const dt = 1000 / fps;
  let n = 0;
  // The caption's state: what it says, how visible it is, and where it is
  // heading; and a black veil over the whole frame, for fades.
  const cap = { text: '', sub: '', mode: 'side', top: 300, at: 0, to: 0 };
  const veil = { at: 0, to: 0, ms: 300 };
  const FADE = 260; // ms of game time, in or out

  const tick = (ms) => page.evaluate((ms) => {
    window.__vt?.tick(ms);
    // The Root screen cross-fade (a framer mount animation) never finishes
    // under the virtual clock: pin it, as scripts/qa/cdp.mjs does.
    document.querySelectorAll('#root > div').forEach((el) => { if (el.style.opacity !== '' && parseFloat(el.style.opacity) < 1) el.style.opacity = '1'; });
  }, ms);
  const settle = (hops = 3) => page.evaluate((hops) => new Promise((r) => {
    let n = hops; const ch = new MessageChannel();
    ch.port1.onmessage = () => { if (--n <= 0) r(true); else ch.port2.postMessage(0); };
    ch.port2.postMessage(0);
  }), hops);
  const toward = (v, ms, span) => {
    if (v.at === v.to) return;
    const d = ms / span;
    v.at = v.to > v.at ? Math.min(v.to, v.at + d) : Math.max(v.to, v.at - d);
  };
  const stepCaption = async (ms) => {
    toward(cap, ms, FADE);
    toward(veil, ms, veil.ms);
    await page.evaluate((c) => window.__capSet?.(c), { text: cap.text, sub: cap.sub, mode: cap.mode, top: cap.top, opacity: Number(cap.at.toFixed(3)), black: Number(veil.at.toFixed(3)) });
  };
  /** Run before each frame is photographed (a slow zoom, a scroll). */
  let eachFrame = null;

  const film = {
    page, errors,
    get frames() { return n; },
    /** Load a page of the app on the virtual clock. */
    async go(query) {
      const url = BASE + query + (query.includes('?') ? '&' : '?') + 'vtclock=1';
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await settle(6);
    },
    /** Film `ms` of game time; `speed` 2 films it in half the frames. One
     *  round trip ticks the clock and sets the caption; the frame is then
     *  photographed over the DevTools protocol (faster than a full
     *  Playwright screenshot, which waits on things a frozen page never does). */
    async roll(ms, speed = 1) {
      const count = Math.max(1, Math.round(ms / dt / speed));
      for (let i = 0; i < count; i++) {
        toward(cap, dt, FADE);
        toward(veil, dt, veil.ms);
        await page.evaluate(([ms, c]) => {
          window.__vt?.tick(ms);
          document.querySelectorAll('#root > div').forEach((el) => { if (el.style.opacity !== '' && parseFloat(el.style.opacity) < 1) el.style.opacity = '1'; });
          window.__capSet?.(c);
        }, [dt * speed, { text: cap.text, sub: cap.sub, mode: cap.mode, top: cap.top, opacity: Number(cap.at.toFixed(3)), black: Number(veil.at.toFixed(3)) }]);
        if (eachFrame) await eachFrame(n);
        // The clip's scale is what makes the frame device pixels (1920 x 1080):
        // without it the protocol hands back CSS pixels. And the clip is in
        // document coordinates: on a scrolled page it starts where the
        // viewport does, or the caption (fixed to the viewport) lands low.
        const [sx, sy] = await page.evaluate(() => [window.scrollX, window.scrollY]);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, clip: { x: sx, y: sy, width: view.width, height: view.height, scale: dpr } });
        fs.writeFileSync(path.join(out, `f${String(n++).padStart(6, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      }
    },
    onFrame(fn) { eachFrame = fn; },
    /** Let `ms` of game time pass with nothing filmed (a cut). */
    async skip(ms) {
      for (let left = ms; left > 0; left -= 100) { await tick(Math.min(100, left)); await settle(1); }
    },
    /** Tick, unfilmed, until `fn` (run in the page) is true; gives up after `max` ms of game time. */
    async until(fn, arg, max = 20000) {
      for (let t = 0; t < max; t += 50) {
        if (await page.evaluate(fn, arg)) return true;
        await tick(50); await settle(1);
      }
      return false;
    },
    /** Film until `fn` (run in the page) is true, at most `max` ms of game time. */
    async rollUntil(fn, arg, max = 20000, speed = 1) {
      for (let t = 0; t < max; t += 100) {
        if (await page.evaluate(fn, arg)) return true;
        await film.roll(100, speed);
      }
      return false;
    },
    /** A real click, then let React commit. Game time is frozen while
     *  Playwright waits, so first tick (unfilmed, or filmed with `roll`)
     *  until the thing can take the click: nothing drawn over its middle. */
    async click(locator, { roll = false, max = 15000 } = {}) {
      for (let t = 0; t < max; t += 100) {
        const free = await locator.evaluate((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && (top === el || el.contains(top) || top.contains(el));
        }).catch(() => false);
        if (free) break;
        if (roll) await film.roll(100); else { await tick(100); await settle(1); }
      }
      await locator.click({ timeout: 8000 });
      await settle(4);
    },
    settle,
    /** Bring the caption in, or take it out with null. `opts`: sub (a small
     *  line under it), mode ('side' | 'plate'), top (a side caption's place). */
    caption(text, opts = {}) {
      if (text === null) { cap.to = 0; return; }
      Object.assign(cap, { text, sub: opts.sub ?? '', mode: opts.mode ?? 'side', top: opts.top ?? cap.top, to: 1 });
      // New words over old ones: start the fade again rather than swap mid-air.
      if (cap.at > 0.05) cap.at = 0;
    },
    /** Fade the whole frame to black (1) or back (0) over `ms` of game time. */
    fade(to, ms = 300) { veil.to = to; veil.ms = ms; },
    /** The frame black at once (to open on a fade-in). */
    black() { veil.at = 1; veil.to = 1; },
    async still(file) { await page.screenshot({ path: file }); },
    async close() { await browser.close(); },
  };
  return film;
}

module.exports = { open, BASE };
