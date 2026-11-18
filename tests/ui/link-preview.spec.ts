import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { LINK_PREVIEW } from '@/ui/share/LinkPreview';

// The link preview: when the game's link is pasted into a chat app, a forum
// or a feed, the app reads index.html's Open Graph and Twitter-card tags and
// shows the picture they name. A crawler runs no script, so the tags are
// plain HTML with whole addresses, and the picture is a file of the site
// (public/link-preview.jpg, baked by scripts/art/bake_link_preview.mjs from
// the page that draws it, ?share=1). These pin the tags to the file.

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
/** The site's own address: GitHub Pages serves the repository at /tcg/. */
const SITE = 'https://brandeispatrick.github.io/tcg/';

/** The content of the <meta> named `key` (a property or a name). */
function meta(key: string): string | undefined {
  const tag = html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`));
  return tag?.[1];
}

/** A JPEG's size, read off its frame header (the SOF0/SOF2 segment). */
function jpegSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect([b[0], b[1]], 'a JPEG starts FF D8').toEqual([0xff, 0xd8]);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error('no frame header in ' + file);
}

describe('the link preview', () => {
  it('names a picture that is a file of the site, by its whole address, for both tag families', () => {
    const image = meta('og:image')!;
    expect(image.startsWith(SITE)).toBe(true);
    expect(meta('twitter:image')).toBe(image);
    expect(existsSync(resolve(root, 'public', image.slice(SITE.length)))).toBe(true);
    expect(meta('og:url')).toBe(SITE);
    // The large picture, not the thumbnail beside the text.
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('the picture is the size the tags say, the size the page that draws it is, and light enough for every app', () => {
    const file = resolve(root, 'public', meta('og:image')!.slice(SITE.length));
    const size = jpegSize(file);
    expect(size).toEqual({ w: LINK_PREVIEW.w, h: LINK_PREVIEW.h });
    expect([Number(meta('og:image:width')), Number(meta('og:image:height'))]).toEqual([size.w, size.h]);
    expect(size.w / size.h).toBeCloseTo(1.91, 1);
    expect(meta('og:image:type')).toBe('image/jpeg');
    expect(statSync(file).size).toBeLessThan(300 * 1024);
  });

  it('says what the game is and whose it is not, in a title and a line short enough not to be cut', () => {
    for (const family of ['og', 'twitter']) {
      const title = meta(`${family}:title`)!, line = meta(`${family}:description`)!;
      expect(title.length, title).toBeLessThanOrEqual(60);
      expect(line.length, line).toBeLessThanOrEqual(160);
      expect(`${title} ${line}`).toMatch(/fan/i);
    }
    expect(meta('og:image:alt')).toBeTruthy();
    expect(meta('description')!.length).toBeLessThanOrEqual(160);
  });

  it('the tab icon is a file of the site too', () => {
    const icon = html.match(/<link rel="icon"[^>]*href="%BASE_URL%([^"]+)"/)?.[1];
    expect(icon).toBeTruthy();
    expect(existsSync(resolve(root, 'public', icon!))).toBe(true);
  });
});
