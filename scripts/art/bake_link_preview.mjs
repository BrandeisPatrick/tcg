/**
 * Bakes the link preview: the picture a chat app, a forum or a social feed
 * shows when the game's link is pasted into it. index.html's Open Graph and
 * Twitter-card tags name the file this writes, public/link-preview.jpg.
 *
 * The picture is a page of the app itself, ?share=1
 * (src/ui/share/LinkPreview.tsx): the title sheet's wordmark over a fan of
 * the game's own hero cards, at 1200 x 630. This photographs that page once
 * its fonts and pictures are in, as a JPEG (a PNG of it is four times the
 * size, and some apps drop a preview over a few hundred kB).
 *
 *   npm run dev            # in another terminal
 *   node scripts/art/bake_link_preview.mjs [OUT=public/link-preview.jpg]
 *
 * DEV_URL when the dev server is not on http://localhost:5173; CHROME and
 * CHROME_FLAGS when Chrome is not where scripts/qa/cdp.mjs looks.
 *
 * Re-bake when the title sheet's look, the card frame or one of the five
 * heroes' cards changes. Apps keep a link's picture for days: to make them
 * fetch a new one at once, give the file a new name here and in index.html.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../qa/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] ?? join(ROOT, 'public/link-preview.jpg');
const DEV_URL = (process.env.DEV_URL ?? 'http://localhost:5173').replace(/\/$/, '');
/** The size every link preview is cut from (LINK_PREVIEW in LinkPreview.tsx). */
const W = 1200, H = 630;
const QUALITY = 88;

const b = await launch({ port: 9341, width: W, height: H });
try {
  await b.navigate(`${DEV_URL}/?share=1`);
  await b.waitFor(`document.querySelector('#link-preview')`, { timeout: 20000 });
  await b.evaluate(`document.fonts.ready.then(() => true)`);
  await b.waitFor(`document.images.length > 0 && [...document.images].every((i) => i.complete && i.naturalWidth > 0)`, { timeout: 20000 });
  const size = await b.evaluate(`(() => { const r = document.querySelector('#link-preview').getBoundingClientRect(); return r.width + 'x' + r.height; })()`);
  if (size !== `${W}x${H}`) throw new Error(`the preview is ${size}, not ${W}x${H}`);
  // Two frames, so the last picture decoded is also painted.
  await b.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
  const shot = await b.send('Page.captureScreenshot', {
    format: 'jpeg', quality: QUALITY, captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
  });
  const bytes = Buffer.from(shot.data, 'base64');
  writeFileSync(OUT, bytes);
  console.log(`${OUT}  ${W}x${H}  ${Math.round(bytes.length / 1024)} kB`);
} finally {
  await b.close();
}
