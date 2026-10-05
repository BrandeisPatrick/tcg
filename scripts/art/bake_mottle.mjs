/**
 * Bakes the story map's paper tooth into a small tile, so the sheet's tiles
 * stop paying for it. The map laid PAPER_MOTTLE (src/ui/poster.ts, an
 * feTurbulence SVG) over the whole sheet with `mix-blend-mode: multiply`: the
 * turbulence ran again for every tile rasterised, a fifth of each tile's
 * cost, and the blend took a layer of its own. This renders the same SVG once
 * in headless Chrome and writes it as a plain see-through PNG that lands
 * where the multiply did, with no blend mode.
 *
 *   node scripts/art/bake_mottle.mjs [OUT=public/art/paper_mottle.png]   (FFMPEG=… if ffmpeg is not on PATH)
 *
 * How a plain overlay stands in for multiply: multiply darkens each channel
 * of what is under it in proportion to it, by α·(1 − C)·B (C the mottle's
 * colour, α its alpha); a plain overlay moves it toward its own colour, by
 * A·(B − C′). No one overlay does that over every B, so A = s·α and C′ are
 * fitted (least squares) over the inks the tooth lies on: the two papers and
 * the water. Re-bake if the mottle or those inks change.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../qa/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] ?? join(ROOT, 'public/art/paper_mottle.png');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
/** Rendered at one pixel per unit of the SVG's 320-unit tile, then averaged
 *  down 2:1 — its finest octave is ~7 units across, so 160px still holds it
 *  (a 320px tile measured the same on screen), and a whole halving keeps the
 *  tile repeating seamlessly. */
const N = 320;
const SIZE = N / 2;
/** The inks under the tooth: paper (Manhattan), paperDeep (the boroughs) and
 *  the water (poster.ts, NycMap.tsx). */
const INKS = [[0xf2, 0xe6, 0xcb], [0xe7, 0xd8, 0xb6], [0x1f, 0x3f, 0x3d]];

// The mottle, from its one source. Its alpha row is raised from 0.075 to 1
// for the render, so colour and alpha come back at full 8-bit precision.
const poster = readFileSync(join(ROOT, 'src/ui/poster.ts'), 'utf8');
const url = poster.match(/PAPER_MOTTLE = `url\("(data:[^"]+)"\)`/)[1];
const ALPHA = 0.075;
const full = url.replace("0 0 0 0.075 0'", "0 0 0 1 0'");
if (full === url) throw new Error('PAPER_MOTTLE no longer has the expected colour matrix');

const b = await launch({ port: Number(process.env.CDP_PORT ?? 9649), width: 400, height: 400 });
let px;
try {
  px = await b.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(full)}; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = ${N};
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, ${N}, ${N});
    return Array.from(g.getImageData(0, 0, ${N}, ${N}).data);
  })()`);
} finally {
  await b.close();
}

// The mottle's colour is the same at every pixel; read it where it is surest.
let at = 0;
for (let i = 0; i < px.length; i += 4) if (px[i + 3] > px[at + 3]) at = i;
const C = px.slice(at, at + 3).map((v) => v / 255);
const k = C.map((v) => 1 - v);

// For a given s the best C′ is the inks' mean pulled back by k/s; try every s.
const mean = [0, 1, 2].map((c) => INKS.reduce((a, ink) => a + ink[c], 0) / INKS.length);
const fit = (s) => {
  const Cp = mean.map((m, c) => Math.min(255, Math.max(0, m * (1 - k[c] / s))));
  let e = 0;
  for (const ink of INKS) for (let c = 0; c < 3; c++) e += (s * (ink[c] - Cp[c]) - k[c] * ink[c]) ** 2;
  return { s, Cp, e };
};
let f = fit(1);
for (let s = 0.05; s < 1; s += 0.001) { const t = fit(s); if (t.e < f.e) f = t; }

const rgba = Buffer.alloc(N * N * 4);
for (let i = 0; i < N * N * 4; i += 4) {
  for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(f.Cp[c]);
  rgba[i + 3] = Math.round(f.s * ALPHA * px[i + 3]);
}
const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${N}x${N}`, '-i', '-',
  '-vf', `scale=${SIZE}:${SIZE}:flags=area`, '-pred', 'mixed', OUT], { input: rgba });
if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
console.log(`mottle rgb(${C.map((v) => Math.round(v * 255)).join(', ')}) at α ≤ ${ALPHA} under multiply → rgb(${f.Cp.map(Math.round).join(', ')}) at ${f.s.toFixed(3)}·α, plain; wrote ${OUT}`);
