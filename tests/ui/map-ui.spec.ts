import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StructuresStrip } from '@/ui/board/StructuresStrip';
import { RejuvenatorMark } from '@/ui/board/RejuvenatorMark';
import { BossPit } from '@/ui/board/BossPit';
import { mapIconUrl, type MapIconKind } from '@/ui/board/MapIcon';
import { ART_CREDITS } from '@/art/credits';
import { freshReadyGame, setTrack } from '../engine/_helpers';

// The map's board pieces wear the game's own icons (public/art/map_*.png,
// fetched from the Deadlock wiki, never drawn here): each side's structures on
// its rule, struck when they fall; the Mid-Boss's pit, naming the round it
// rises or returns in while it is not up; the Rejuvenator's tag. These pin the
// files, their credit, and what the pieces print.

const KINDS: MapIconKind[] = ['guardian', 'walker', 'patron', 'mid_boss', 'rejuvenator'];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('the map icons are the game\'s own files, credited', () => {
  it('every icon the board asks for is a PNG in public/art', () => {
    for (const kind of KINDS) {
      expect(mapIconUrl(kind)).toMatch(new RegExp(`art/map_${kind}\\.png$`));
      const file = resolve(__dirname, `../../public/art/map_${kind}.png`);
      expect(existsSync(file), kind).toBe(true);
      expect(readFileSync(file).subarray(0, 8).equals(PNG), kind).toBe(true);
    }
  });

  it('the credits list them, from the Deadlock wiki', () => {
    const map = ART_CREDITS.flatMap((g) => g.items).find((c) => c.id === 'map-icons');
    expect(map).toBeDefined();
    expect(map!.links.some((l) => l.href.startsWith('https://deadlock.wiki'))).toBe(true);
  });
});

describe('the structures strip', () => {
  const strip = (G: ReturnType<typeof freshReadyGame>, isMobile = true) =>
    renderToStaticMarkup(createElement(StructuresStrip, { ps: G.players['1'], label: 'Sapphire Flame', accent: '#d4392c', isMobile }));

  it('prints Guardian · Walker · Patron, each its icon and a pip a point, and strikes the fallen', () => {
    const G = freshReadyGame();
    setTrack(G, '1', { guardian: 4, walker: 6, patron: 8 });
    G.players['1'].structures[0].hp = 0;
    G.players['1'].structures[1].hp = 4;
    const html = strip(G);
    expect(html).toContain('Sapphire Flame structures: 12 of 18 HP — Guardian down, Walker 4 of 6, Patron 8 of 8');
    for (const kind of ['guardian', 'walker', 'patron']) expect(html).toContain(`data-map-icon="${kind}"`);
    expect(html).toContain('data-struck="guardian"');
    expect(html).not.toContain('data-struck="walker"');
    expect(html).not.toContain('data-struck="patron"');
  });

  it('a phone prints the icons alone; a desktop names them too', () => {
    const G = freshReadyGame();
    expect(strip(G, true)).not.toContain('>Walker<');
    expect(strip(G, false)).toContain('>Walker<');
  });

  it('a Patron-only track (a Story fight) draws the Patron alone', () => {
    const G = freshReadyGame();
    setTrack(G, '1', { patron: 3 });
    const html = strip(G);
    expect(html).toContain('data-map-icon="patron"');
    expect(html).not.toContain('data-map-icon="guardian"');
    expect(html).not.toContain('data-map-icon="walker"');
  });
});

describe('the Mid-Boss pit and the Rejuvenator', () => {
  const pit = (G: ReturnType<typeof freshReadyGame>) => renderToStaticMarkup(createElement(BossPit, {
    G, me: '0', pending: null, onTapHero: () => {}, isTargetable: () => false, isMobile: true,
  }));

  it('with no boss up, the pit names the round it rises in, then the round it returns in', () => {
    const G = freshReadyGame();
    G.boss = null;
    G.bossRespawnRound = 4;
    expect(pit(G)).toContain('Mid-Boss — rises in round 4');
    G.record['1'].bossKills = 1;
    G.bossRespawnRound = 9;
    const html = pit(G);
    expect(html).toContain('Mid-Boss — returns in round 9');
    expect(html).toContain('data-map-icon="mid_boss"');
  });

  it('the Rejuvenator tag shows only while a side holds revives: its icon, the count and the last round', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.reviveCredits = 0;
    expect(renderToStaticMarkup(createElement(RejuvenatorMark, { ps, isMobile: true }))).toBe('');
    ps.reviveCredits = 2;
    ps.reviveUntilRound = 7;
    const html = renderToStaticMarkup(createElement(RejuvenatorMark, { ps, isMobile: true }));
    expect(html).toContain('Rejuvenator: 2 revives, through round 7');
    expect(html).toContain('data-map-icon="rejuvenator"');
  });
});
