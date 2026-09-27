/**
 * Minimal headless-Chrome CDP driver for the FX QA scripts — raw WebSocket
 * over `ws` (a transitive dependency of boardgame.io), no Puppeteer.
 *
 *   import { launch } from './cdp.mjs'
 *
 * Why not the in-app browser pane: a hidden pane freezes rAF, so animations
 * never advance between screenshots. Headless Chrome renders on demand, and
 * with `?vtclock=1` the app's clock is stepped by `tick(ms)` so any frame of
 * an animation can be captured exactly (see src/qa/vtclock.ts).
 *
 * Lessons baked in: CDP screenshot clips are in DOCUMENT coordinates (add
 * window.scrollX/Y to a bounding rect); after a JS click, let React commit
 * (`settle`) before ticking; the Root screen cross-fade (a framer mount
 * animation) never finishes under the virtual clock, so `tick` pins it.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'));
const WebSocket = require('ws');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333, width = 1440, height = 900, scale = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tcg-cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await res.json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
        errors.push(`[console.${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: width < 768 });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };
  const navigate = async (url) => {
    const loaded = new Promise((r) => on('Page.loadEventFired', r));
    await send('Page.navigate', { url });
    await loaded;
  };
  const waitFor = async (expr, { timeout = 15000, step = 100 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(`!!(${expr})`)) return true;
      await sleep(step);
    }
    throw new Error('waitFor timed out: ' + expr);
  };
  const shot = async (file, clip) => {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: clip.scale ?? 1 };
    const r = await send('Page.captureScreenshot', params);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  // Real mouse click at viewport coords.
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  // Find an element by a JS finder expression, scroll it into view and click its centre for real.
  const clickEl = async (finder, { js = false, scroll = true } = {}) => {
    const rect = await evaluate(`(() => { const el = (${finder}); if (!el) return null; if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
    if (!rect) throw new Error('clickEl: not found: ' + finder);
    if (js) { await evaluate(`(${finder}).click()`); return rect; }
    const hit = await evaluate(`(() => { const el = document.elementFromPoint(${rect.x}, ${rect.y}); const want = (${finder}); return el && (el === want || want.contains(el) || el.contains(want)) ? 'HIT' : 'COVERED-BY-' + (el ? (el.tagName + '.' + (el.className || '') + '#' + (el.id || '') + ' aria=' + (el.getAttribute('aria-label') || '')) : 'nothing'); })()`);
    await clickAt(rect.x, rect.y);
    return { ...rect, hit };
  };
  // Under ?vtclock=1: advance the virtual clock. Otherwise real sleep.
  // The Root screen cross-fade (a framer mount animation) never finishes under
  // the virtual clock — a harness artifact, not a product bug. Pin it so the
  // screenshots are readable.
  const unstickFade = () => evaluate(`document.querySelectorAll('#root > div').forEach((el) => { if (el.style.opacity !== '' && parseFloat(el.style.opacity) < 1) el.style.opacity = '1'; })`);
  const tick = async (ms) => {
    const has = await evaluate('typeof window.__vt !== "undefined"');
    if (has) { const r = await evaluate(`window.__vt.tick(${ms})`); await unstickFade(); return r; }
    await sleep(ms);
    return null;
  };
  // Let React commit (MessageChannel hops) after a click before ticking.
  const settle = async (hops = 3) => evaluate(`new Promise((r) => { let n = ${hops}; const ch = new MessageChannel(); ch.port1.onmessage = () => { if (--n <= 0) r(true); else ch.port2.postMessage(0); }; ch.port2.postMessage(0); })`);
  const close = async () => { try { ws.close(); } catch {} proc.kill('SIGKILL'); };
  return { send, on, evaluate, navigate, waitFor, shot, clickAt, clickEl, tick, settle, close, errors };
}

export const byText = (text, tag = 'button') => `[...document.querySelectorAll('${tag}')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
export const byTextStart = (text, tag = 'button') => `[...document.querySelectorAll('${tag}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`;
export const byAria = (label) => `document.querySelector('[aria-label=${JSON.stringify(label)}]')`;
export const byAriaStart = (prefix) => `[...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith(${JSON.stringify(prefix)}))`;
