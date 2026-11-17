import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_CARDS, CARDS_BY_ID, SPELLS, ULTIMATES, EQUIPMENT } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import { poster } from '@/ui/poster';
import { RuleText, KEYWORDS, KEYWORD_STATUS, statusOfKeyword } from '@/ui/card/RuleText';
import { CardFrame } from '@/ui/card/CardFrame';
import {
  KINDS, explainNumber, liveTotal, parseMarkup, plainText, shownNumber, type NumberSpec,
} from '@/ui/card/scaling';
import { numberContent, statusContent } from '@/ui/explain/content';
import { statusLabel } from '@/ui/card/StatusIcon';

// A printed number says what it scales with by its colour: purple grows with
// Spirit Power, brown with Bullet Power, ink is flat. Cards mark a scaling
// number `{sp:3}` / `{bp:3}` (card/scaling.ts); RuleText draws it, and
// everything that reads card text as a string goes through `plainText`.

const html = (text: string, scale?: Parameters<typeof RuleText>[0]['scale'], keywordColor?: string) =>
  renderToStaticMarkup(createElement(RuleText, { text, scale, keywordColor }));
/** The text of rendered markup, as a reader sees it. */
const readable = (markup: string) => markup.replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');

const sp = (base: number, per = 1): NumberSpec => ({ kind: 'sp', base, per });
const bp = (base: number, per = 1): NumberSpec => ({ kind: 'bp', base, per });

describe('the markup', () => {
  it('reads {sp:3} and {bp:2} as scaling numbers among plain runs; a damage number drops its type word', () => {
    // Since 2026-11-17 (Patrick: "deal 1 damage", the colour says the type) the word goes.
    expect(parseMarkup('Deal {sp:3} spirit damage.')).toEqual([
      { type: 'text', text: 'Deal ' },
      { type: 'num', raw: '{sp:3}', kind: 'sp', base: 3, per: 1, dmg: 'spirit' },
      { type: 'text', text: ' damage.' },
    ]);
    expect(parseMarkup('Shield {sp:2}.')).toEqual([
      { type: 'text', text: 'Shield ' },
      { type: 'num', raw: '{sp:2}', kind: 'sp', base: 2, per: 1 },
      { type: 'text', text: '.' },
    ]);
    expect(parseMarkup('{bp:2}')).toEqual([{ type: 'num', raw: '{bp:2}', kind: 'bp', base: 2, per: 1 }]);
  });

  it('reads several in one text, of both kinds', () => {
    const toks = parseMarkup('{sp:2} → {sp:3} → {bp:4} (Shield 2)');
    expect(toks.filter((t) => t.type === 'num').map((t) => (t.type === 'num' ? `${t.kind}${t.base}` : ''))).toEqual(['sp2', 'sp3', 'bp4']);
    expect(plainText('{sp:2} → {sp:3} → {bp:4} (Shield 2)')).toBe('2 → 3 → 4 (Shield 2)');
  });

  it('text without markup is one plain run', () => {
    expect(parseMarkup('Heal an ally for 2.')).toEqual([{ type: 'text', text: 'Heal an ally for 2.' }]);
    expect(parseMarkup('')).toEqual([{ type: 'text', text: '' }]);
  });

  it('reads {sp:1/2} as half the stat, rounded down', () => {
    expect(parseMarkup('+{sp:1/2} Bullet Power')[1]).toMatchObject({ type: 'num', kind: 'sp', base: 1, per: 2 });
  });

  it('leaves anything malformed in the text exactly as written', () => {
    for (const bad of ['{sp:}', '{sp:x}', '{sp:3', 'sp:3}', '{xx:3}', '{sp:-3}', '{sp: 3}', '{SP:3}', '{sp:1/0}', '{sp:1/}', '{ sp:3 }', '{}']) {
      expect(parseMarkup(`a ${bad} b`), bad).toEqual([{ type: 'text', text: `a ${bad} b` }]);
      expect(plainText(`a ${bad} b`), bad).toBe(`a ${bad} b`);
    }
    // …and a good mark beside a bad one still reads.
    expect(plainText('{sp:} and {sp:4}')).toBe('{sp:} and 4');
  });

  it('keywords still read in the runs around a number', () => {
    const out = html('Stun enemy Active and deal {sp:3} spirit damage.');
    expect(out).toContain('<strong');
    expect(out).toContain('>Stun<');
    expect(readable(out)).toBe('Stun enemy Active and deal 3 damage.');
  });

  it('a flat damage number is typed by its colour too: "3 spirit damage", "+2 bullet damage", "1 more spirit damage"', () => {
    expect(parseMarkup('deal 3 spirit damage to every enemy')).toEqual([
      { type: 'text', text: 'deal ' },
      { type: 'num', raw: '3', kind: 'sp', base: 3, per: 1, dmg: 'spirit', flat: true },
      { type: 'text', text: ' damage' },
      { type: 'text', text: ' to every enemy' },
    ]);
    expect(plainText('His attacks deal +2 bullet damage to a hero below half HP.')).toBe('His attacks deal +2 damage to a hero below half HP.');
    expect(plainText('his attacks deal {sp:3} more spirit damage.')).toBe('his attacks deal 3 more damage.');
    expect(plainText('takes 2 more pure damage')).toBe('takes 2 more pure damage');
    expect(plainText('Reduce spirit damage by 2.')).toBe('Reduce spirit damage by 2.');
    // The sheet's own lines write a typed number outright.
    expect(parseMarkup('Deal {b:1} + {s:3} damage.').filter((t) => t.type === 'num')).toMatchObject([{ dmg: 'bullet', flat: true, base: 1 }, { dmg: 'spirit', flat: true, base: 3 }]);
    expect(plainText('Deal {b:1} + {s:3} damage.')).toBe('Deal 1 + 3 damage.');
  });

  it('drawn in the type\'s colour: spirit purple, bullet brown; only a number that scales is underlined', () => {
    expect(html('deal 3 spirit damage')).toMatch(/style="color:#7a4a8a/);
    expect(html('deal 2 bullet damage')).toMatch(new RegExp(`style="color:${poster.stat.bullet}`));
    expect(readable(html('deal 2 bullet damage'))).toBe('deal 2 damage');
  });

  it('a search or a voice keeps the type word (`typed`)', () => {
    expect(plainText('Deal {sp:4} spirit damage and 2 bullet damage.', { typed: true })).toBe('Deal 4 spirit damage and 2 bullet damage.');
  });
});

describe('the live value', () => {
  it('prints the base number when nothing is known', () => {
    expect(shownNumber(sp(3))).toBe('3');
    expect(liveTotal(sp(3))).toBeUndefined();
  });

  it('adds the stat when the figure is known: a Spirit number reads spirit, a Bullet number reads bullet', () => {
    expect(shownNumber(sp(1), { spirit: 2, bullet: 7 })).toBe('3');
    expect(shownNumber(bp(1), { spirit: 2, bullet: 7 })).toBe('8');
    expect(shownNumber(bp(1), { spirit: 2 })).toBe('1'); // no bullet figure: the base
  });

  it('halves the stat and rounds down for {sp:1/2}', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => shownNumber(sp(1, 2), { spirit: s }))).toEqual(['1', '1', '2', '2', '3', '3']);
  });

  it('a card face prints its own number and keeps the live figure for the explanation', () => {
    expect(shownNumber(sp(4), { spirit: 3, printed: true })).toBe('4');
    expect(shownNumber(sp(4), { spirit: 3 })).toBe('7');
  });

  it('{sp:0} is the stat itself: the words until a figure is known, then the figure', () => {
    expect(shownNumber(sp(0))).toBe('Spirit Power');
    expect(shownNumber(sp(0), { spirit: 3, printed: true })).toBe('Spirit Power');
    expect(shownNumber(sp(0), { spirit: 3 })).toBe('3');
    expect(shownNumber(sp(0), { spirit: 0 })).toBe('0');
    expect(plainText('+ {sp:0} (spirit)')).toBe('+ Spirit Power (spirit)');
  });

  it('RuleText prints the live total in the number\'s colour', () => {
    const out = html('Deal {sp:1} spirit damage.', { spirit: 2, who: 'Kelvin' });
    expect(readable(out)).toBe('Deal 3 damage.');
    expect(out).toMatch(/data-scales="sp" style="color:#7a4a8a/);
  });

  it('the explanation shows the sum for a hero in play', () => {
    expect(explainNumber(sp(1), { spirit: 2, who: 'Kelvin' }).lead).toBe("1 + Kelvin's Spirit Power 2 = 3");
    expect(explainNumber(sp(3), { spirit: 2, who: 'Warden' }).lead).toBe("3 + Warden's Spirit Power 2 = 5");
    expect(explainNumber(bp(3), { bullet: 2, who: 'Warden' }).lead).toBe("3 + Warden's Bullet Power 2 = 5");
    expect(explainNumber(sp(1, 2), { spirit: 3, who: 'Dynamo' }).lead).toBe("1 + half of Dynamo's Spirit Power 3, rounded down = 2");
    expect(explainNumber(sp(0), { spirit: 2, who: 'Wraith' }).lead).toBe("Wraith's Spirit Power 2");
  });

  it('…and the formula alone when nothing is known', () => {
    expect(explainNumber(sp(3)).lead).toBe('3 + Spirit Power');
    expect(explainNumber(bp(3)).lead).toBe('3 + Bullet Power');
    expect(explainNumber(sp(3), { who: 'Kelvin', printed: true }).lead).toBe("3 + Kelvin's Spirit Power");
  });

  it('a spell in hand says "+ your Active\'s Spirit Power (N now)"', () => {
    expect(explainNumber(sp(4), { who: 'your Active', spirit: 2, printed: true }).lead).toBe("4 + your Active's Spirit Power (2 now)");
    expect(explainNumber(sp(4), { who: 'your Active', printed: true }).lead).toBe("4 + your Active's Spirit Power");
    expect(explainNumber(sp(1, 2), { who: 'your Active', spirit: 3, printed: true }).lead).toBe("1 + half of your Active's Spirit Power (3 now)");
  });

  it('the rule of the colour is spoken with the title', () => {
    expect(numberContent(sp(3))).toMatchObject({ title: 'Spirit Power', accent: poster.stat.spirit, lines: ['Purple numbers grow with Spirit Power.'] });
    expect(numberContent(bp(3))).toMatchObject({ title: 'Bullet Power', accent: poster.stat.bullet, lines: ['Brown numbers grow with Bullet Power.'] });
  });
});

describe('plainText', () => {
  it('strips the markup to the bare number', () => {
    expect(plainText('Deal {sp:4} spirit damage to enemy Active.')).toBe('Deal 4 damage to enemy Active.');
    expect(plainText('Heal an ally 2 and grant +{sp:1/2} Bullet Power for 2 turns.')).toBe('Heal an ally 2 and grant +1 Bullet Power for 2 turns.');
  });

  it('leaves text with no markup alone, and nothing becomes empty', () => {
    expect(plainText('Heal an ally for 2.')).toBe('Heal an ally for 2.');
    expect(plainText(undefined)).toBe('');
    expect(plainText('')).toBe('');
  });
});

describe('the colour per kind', () => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const hue = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };

  const sat = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1));
  };

  it('purple is Spirit Power and brown is Bullet Power; plain ink is flat', () => {
    expect(KINDS.sp.ink).toBe(poster.stat.spirit);
    expect(KINDS.bp.ink).toBe(poster.stat.bullet);
    expect(poster.stat.spirit).toBe('#7a4a8a');
    expect(poster.stat.atk).toBe(poster.ink); // the flat number's own ink
  });

  it('both read on the cream card (4.5:1 on paper, deep paper and the label band)', () => {
    for (const ink of [poster.stat.spirit, poster.stat.bullet]) {
      for (const ground of [poster.paper, poster.paperDeep, poster.paperBand]) {
        expect(contrast(ink, ground), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('brown is clearly neither the poster red, nor the ink, nor purple', () => {
    const b = poster.stat.bullet;
    expect(sat(b)).toBeGreaterThan(0.5); // a colour, not a dark grey: the ink's saturation is ~0.1
    expect(sat(poster.ink)).toBeLessThan(0.2);
    expect(Math.abs(hue(b) - hue(poster.red))).toBeGreaterThan(15);
    expect(Math.abs(hue(b) - hue(poster.stat.spirit))).toBeGreaterThan(60);
    expect(hue(b)).toBeGreaterThan(20); expect(hue(b)).toBeLessThan(50); // an orange-brown hue
  });

  it('a number is drawn in its kind\'s colour, a flat number in the text\'s own', () => {
    const out = html('{sp:3} and {bp:2} and 5');
    expect(out).toContain(`color:${poster.stat.spirit}`);
    expect(out).toContain(`color:${poster.stat.bullet}`);
    expect(out).not.toMatch(/data-scales="[a-z]+"[^>]*>5</); // the flat 5 is not a scaling number
    expect(out).toMatch(/ and 5<\/span>$/);
  });

  it('on an action plate (`plate`) the colour becomes the number\'s ground; a keyword colour alone no longer boxes it (2026-11-17)', () => {
    const out = renderToStaticMarkup(createElement(RuleText, { text: 'Deal {sp:3} spirit damage.', plate: poster.paper }));
    expect(out).toContain(`background:${poster.stat.spirit};color:${poster.paper}`);
    expect(html('Deal {sp:3} spirit damage.', undefined, poster.ink)).not.toContain('background:');
    // And the contrast of that pill: paper type on purple, and on brown.
    expect(contrast(poster.paper, poster.stat.spirit)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(poster.paper, poster.stat.bullet)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('status words in card text explain the status', () => {
  it('every keyword that names a status is a keyword, and names one the registry knows', () => {
    for (const [word, id] of Object.entries(KEYWORD_STATUS)) {
      expect(KEYWORDS[word], word).toBeTruthy();
      expect(STATUSES_BY_ID[id], `${word} -> ${id}`).toBeTruthy();
    }
    // The statuses the new kits bring are keywords too (Fixation was one until it became a flat bonus, 2026-11-16).
    for (const word of ['Dome', 'Rooted', 'Rabbit', 'Last Stand']) expect(KEYWORD_STATUS[word], word).toBeTruthy();
    expect(KEYWORD_STATUS.Fixation).toBeUndefined();
  });

  it('the status takes the number printed after it, and a minus makes it the debuff', () => {
    expect(statusOfKeyword('Shield', ' 2 on an ally')).toEqual({ id: 'shield', value: 2 });
    expect(statusOfKeyword('Bleed', ' 3 for 2 turns')).toEqual({ id: 'bleed', value: 3 });
    expect(statusOfKeyword('Bullet Resist', ' −1 for 1 turn')).toEqual({ id: 'bullet_resist_down', value: 1 });
    expect(statusOfKeyword('Bullet Resist', ' 5 for 2 turns')).toEqual({ id: 'bullet_resist', value: 5 });
    expect(statusOfKeyword('Spirit Power', ' −1 for 2 turns')).toEqual({ id: 'spirit_power_down', value: 1 });
    expect(statusOfKeyword('Stun', ' enemy Active 1 turn')).toEqual({ id: 'stun', value: undefined });
    // …or, with nothing after it, the number just before ("+2 Bullet Power").
    expect(statusOfKeyword('Bullet Power', '.', '+2 ')).toEqual({ id: 'weapon_power', value: 2 });
    expect(statusOfKeyword('Bullet Power', ' until the end', 'After the bearer uses a skill: +2 ')).toEqual({ id: 'weapon_power', value: 2 });
    expect(statusOfKeyword('Shield', ' 2.', 'gain ')).toEqual({ id: 'shield', value: 2 });
    // A word of the card that is not a status explains nothing.
    expect(statusOfKeyword('Vulnerable', ' (take +1 dmg)')).toBeNull();
    expect(statusOfKeyword('On attach', '')).toBeNull();
    expect(statusOfKeyword('spirit damage', '')).toBeNull();
  });

  it('a status keyword in the text is a trigger; a card word is not', () => {
    const out = html('Stun enemy Active. Grant Shield 2. Vulnerable for 1 turn. Start of turn: heal 1.');
    expect((out.match(/data-explain=/g) ?? []).length).toBe(2); // Stun and Shield
    expect(readable(out)).toBe('Stun enemy Active. Grant Shield 2. Vulnerable for 1 turn. Start of turn: heal 1.');
  });

  it('a chip says its title, its text with the value filled in, and the turns left', () => {
    expect(statusContent('bleed', { value: 2, duration: 2 })).toMatchObject({
      title: 'Bleed', lines: ['Take 2 Pure dmg at start of turn (stacks, max 3).', '2 turns left.'],
    });
    expect(statusContent('stun', { value: 1, duration: 1 }).lines).toEqual(['Cannot act, attack, or use skills.', '1 turn left.']);
    expect(statusContent('shield', { value: 3, duration: 999 }).lines).toEqual(['Absorb 3 damage, then break.']); // no timer on a permanent one
    expect(statusContent('shield').lines).toEqual(['Absorb N damage, then break.']); // a keyword has no number yet
  });

  it('Fixation says what it does in its own words: a bonus on Haze\'s attacks, no status to explain', () => {
    expect(STATUSES_BY_ID.fixation).toBeUndefined();
    expect((ABILITIES_BY_ID.passive_haze_fixation as { text?: string }).text).toBe("Haze's attacks deal +{bp:1/2} bullet damage to an enemy below full HP.");
  });

  it('an id the registry does not know still reads', () => {
    expect(statusContent('mystery_status', { value: 1 }).title).toBe(statusLabel('mystery_status'));
  });
});

// ---------------------------------------------------------------------------
// The text of every card, as printed.

const ABILITY_TEXT = Object.values(ABILITIES_BY_ID).filter((a) => typeof a.text === 'string') as Array<{ id: string; text: string }>;

describe('no raw markup reaches the screen', () => {
  it('every card in ALL_CARDS renders with no brace in it', () => {
    expect(ALL_CARDS.length).toBeGreaterThan(60);
    for (const card of ALL_CARDS) {
      const out = renderToStaticMarkup(createElement(CardFrame, { cardId: card.id, size: 'full' }));
      expect(out, card.id).not.toMatch(/[{}]/);
      expect(readable(out), card.id).not.toMatch(/\{(sp|bp):/);
    }
  });

  it('…at hand size, too', () => {
    for (const card of ALL_CARDS) {
      expect(renderToStaticMarkup(createElement(CardFrame, { cardId: card.id, size: 'hand' })), card.id).not.toMatch(/[{}]/);
    }
  });

  it('every ability\'s text renders with no brace in it, with and without live figures', () => {
    expect(ABILITY_TEXT.length).toBeGreaterThan(15);
    for (const a of ABILITY_TEXT) {
      expect(html(a.text), a.id).not.toMatch(/[{}]/);
      expect(html(a.text, { spirit: 2, bullet: 3, who: 'Hero' }), a.id).not.toMatch(/[{}]/);
      expect(plainText(a.text), a.id).not.toMatch(/[{}]/);
    }
  });

  it('every card text parses: each brace is part of a whole mark', () => {
    const texts = [...ALL_CARDS.map((c) => ('text' in c ? c.text : undefined)), ...ABILITY_TEXT.map((a) => a.text)].filter((t): t is string => !!t);
    for (const t of texts) expect(plainText(t), t).not.toMatch(/[{}]/);
  });
});

// ---------------------------------------------------------------------------
// The marks match the code: a number is purple when the effect adds Spirit to it.

const abilitiesSource = readFileSync(resolve(__dirname, '../../src/abilities/index.ts'), 'utf8');
const statusOpsSource = readFileSync(resolve(__dirname, '../../src/engine/statusOps.ts'), 'utf8');

/** Every ability whose effect reads Spirit, by id — found in the source: its
 *  block calls `spi(`, `activeSpi(`, `ultSpi(` or `effectiveSpirit(`, or it
 *  opens a channel (`'casting'`), whose pulse adds the caster's Spirit where
 *  it is dealt (`tickCastingPulses`). */
function abilitiesReadingSpirit(): Set<string> {
  const out = new Set<string>();
  for (const m of abilitiesSource.matchAll(/^const \w+: (?:Hero)?AbilityDef = \{\n([\s\S]*?)^\};/gm)) {
    const body = m[1];
    const id = /id: '([^']+)'/.exec(body)?.[1];
    if (id && (/\b(?:spi|activeSpi|ultSpi|effectiveSpirit)\(/.test(body) || /'casting(_light)?'/.test(body))) out.add(id);
  }
  return out;
}

/** Two ultimates that were channels (their Spirit read in the pulse,
 *  `tickCastingPulses`) are one hit each since the hero rebuild: they read
 *  Spirit in their own effect, like every other ultimate. Seven's Storm Cloud
 *  is a channel again (Patrick, 2026-11-15): its Spirit is read in the pulse. */
const ONCE_CHANNELS = ['eff_ult_dynamo', 'eff_ult_warden'];
const CHANNELS = ['eff_ult_seven'];

/** Spirit scales these abilities through a skill's `scalesSpirit` flag too. */
const READS_SPIRIT = abilitiesReadingSpirit();

/** Cards (or hero abilities) whose text may carry a Bullet Power mark, each
 *  with the code that adds it. Toxic Bullets (2026-11-16): its Toxins burst for
 *  TOXIN_BURST + the bearer's Bullet Power (`effectiveAtk(source)` in
 *  eff_toxic_bullets). (Split Shot carried one while its damage was the
 *  Active's swing, and lost it when it became Ricochet 2.) */
const BP_SCALING: string[] = [
  'toxic_bullets',
  // Every hero skill and passive scales with Spirit or Bullet Power (Patrick, 2026-11-17);
  // these three with Bullet Power: 1 + half the hero's Attack (`effectiveAtk`), counted once.
  'skill_silver', 'passive_haze_fixation', 'passive_drifter_bloodscent',
  // And two ultimates: Bullet Dance ({bp:0}, her Attack) and Lycan Curse ({bp:1/2}).
  'ult_haze', 'ult_silver',
];

/** Where an ability's text is printed: a hero ability prints its own; a spell,
 *  an ultimate or a piece of gear prints the card's. */
function textOf(abilityId: string): string[] {
  const own = ABILITIES_BY_ID[abilityId] as { text?: string } | undefined;
  if (own?.text) return [own.text];
  return ALL_CARDS
    .filter((c) => c.type !== 'hero' && c.abilities?.includes(abilityId))
    .map((c) => ('text' in c ? c.text : undefined) ?? '');
}

describe('a number is purple exactly when its effect adds Spirit Power', () => {
  it('the source scan finds the abilities the skills, spells and ultimates are known to be', () => {
    const found = abilitiesReadingSpirit();
    for (const id of [
      'skill_mo_krill', 'skill_kelvin', 'skill_lady_geist', 'skill_paige', 'skill_rem',
      'passive_lash_ground_strike', // Lash's landing, {sp:3} (2026-11-17)
      'skill_seven', 'skill_shiv', 'skill_yamato', 'skill_dynamo', 'skill_vindicta', 'status_flying', 'passive_mirage_djinns_mark',
      'skill_viscous', // The Cube's heal, {sp:3} since 2026-11-16
      'eff_cold_front', 'eff_silence_glyph',
      'eff_ult_abrams', 'eff_ult_dynamo', 'eff_ult_kelvin', 'eff_ult_lady_geist', 'eff_ult_mo_krill',
      'eff_ult_paige', 'eff_ult_seven', 'eff_ult_shiv', 'eff_ult_viscous', 'eff_ult_wraith',
      'eff_ult_warden', 'eff_ult_drifter',
      // Every skill and passive scales (Patrick, 2026-11-17): these four read Spirit since.
      'skill_wraith', 'skill_sinclair', 'skill_warden', 'passive_abrams_heal', 'passive_victor_aura',
      // And every ultimate (Patrick, 2026-11-17), Bullet Dance and Lycan Curse by Bullet Power:
      'eff_ult_lash', 'eff_ult_rem', 'eff_ult_yamato', 'eff_ult_mirage', 'eff_ult_victor', 'eff_ult_graves',
    ]) expect(found.has(id), id).toBe(true);
    // Reads no Spirit: Bullet Dance (Haze's Attack, {bp:0}); Lash's Grapple, whose payoff is an
    // attack (Bullet Power) and Ground Strike's {sp:3}.
    for (const id of [
      'skill_lash', 'eff_ult_haze',
      'eff_ult_vindicta', // Flight puts up the Flying status; the status's own proc reads Spirit
    ]) expect(found.has(id), id).toBe(false);
  });

  it('a channel reads Spirit where its pulse is dealt (Storm Cloud); the two ultimates that were channels read it in their own hit and open none', () => {
    expect(statusOpsSource).toMatch(/const perTick = channel\.value \+ effectiveSpirit\(c\)/);
    for (const id of CHANNELS) {
      const block = new RegExp(`const ${id}: AbilityDef = \\{\\n([\\s\\S]*?)^\\};`, 'm').exec(abilitiesSource)?.[1] ?? '';
      expect(block, id).toMatch(/'casting'/);
      expect(block, id).not.toMatch(/ultSpi\(/); // not twice: the pulse adds it
    }
    for (const id of ONCE_CHANNELS) {
      const block = new RegExp(`const ${id}: AbilityDef = \\{\\n([\\s\\S]*?)^\\};`, 'm').exec(abilitiesSource)?.[1] ?? '';
      expect(block, id).toMatch(/ultSpi\(/);
      expect(block, id).not.toMatch(/'casting(_light)?'/);
    }
  });

  it('every ability with scalesSpirit: true is in that set', () => {
    for (const a of Object.values(ABILITIES_BY_ID)) if (a.scalesSpirit) expect(READS_SPIRIT.has(a.id), a.id).toBe(true);
  });

  it('every ability that reads Spirit has a {sp: in the text that prints it', () => {
    for (const id of READS_SPIRIT) {
      const texts = textOf(id);
      expect(texts.length, `${id} prints no text`).toBeGreaterThan(0);
      for (const t of texts) expect(t, `${id}: ${t}`).toMatch(/\{sp:/);
    }
  });

  it('no {sp: sits on an ability that does not read Spirit', () => {
    for (const a of ABILITY_TEXT) if (!READS_SPIRIT.has(a.id)) expect(a.text, a.id).not.toMatch(/\{sp:/);
    for (const card of ALL_CARDS) {
      if (card.type === 'hero' || !card.text) continue;
      const reads = (card.abilities ?? []).some((id) => READS_SPIRIT.has(id));
      if (!reads) expect(card.text, card.id).not.toMatch(/\{sp:/);
    }
  });

  it('the first mark carries the ability\'s base number', () => {
    for (const id of READS_SPIRIT) {
      const base = (ABILITIES_BY_ID[id] as { base?: number }).base;
      // Where the main effect is control with no number, `base` is that control's worth to the AI
      // (the lift, the Sleep, the Rabbit, the Gravestone, the revival) and the printed number is the scaling part.
      if (base === undefined || ['eff_ult_lash', 'eff_ult_rem', 'eff_ult_graves', 'eff_ult_victor', 'skill_sinclair'].includes(id)) continue;
      const first = parseMarkup(textOf(id)[0]).find((t) => t.type === 'num');
      expect(first && first.type === 'num' ? first.base : undefined, id).toBe(base);
    }
  });

  it('half-scaling is written {sp:N/2} exactly where the code adds floor(Spirit / 2) — Tag Along\'s Attack and Victor\'s aura (2026-11-17: Spirit counted once, as gear counts it, and on every enemy)', () => {
    const halfMarked = [...READS_SPIRIT].filter((id) => textOf(id).some((t) => /\{sp:\d+\/2\}/.test(t)));
    const halfCode = abilitiesSource.match(/Math\.floor\((?:spi|activeSpi|ultSpi|effectiveSpirit)\([^)]*\) \/ 2\)/g) ?? [];
    expect(halfMarked.sort()).toEqual(['eff_ult_graves', 'passive_victor_aura', 'skill_rem']);
    expect(halfCode).toHaveLength(3);
  });

  it('gear that adds Spirit Power, and every flat number, stays plain ink', () => {
    // Gear marks only an effect of its own that scales (BP_SCALING), never a stat it adds.
    for (const e of EQUIPMENT) if (!BP_SCALING.includes(e.id)) expect(e.text, e.id).not.toMatch(/\{(sp|bp):/);
    for (const id of ['healing_rite', 'rusted_barrel', 'metal_skin', 'decay', 'knockdown']) {
      expect((CARDS_BY_ID[id] as { text: string }).text, id).not.toMatch(/\{/);
    }
  });

  it('a {bp: appears only where the list says', () => {
    const marked = [
      ...ALL_CARDS.filter((c) => c.type !== 'hero' && /\{bp:/.test(c.text ?? '')).map((c) => c.id),
      ...ABILITY_TEXT.filter((a) => /\{bp:/.test(a.text)).map((a) => a.id),
    ];
    expect(marked.sort()).toEqual([...BP_SCALING].sort());
    // And the code adds it: Toxic Bullets' burst reads its bearer's Bullet Power.
    const toxic = /const eff_toxic_bullets: AbilityDef = \{\n([\s\S]*?)^\};/m.exec(abilitiesSource)?.[1] ?? '';
    expect(toxic).toMatch(/TOXIN_BURST \+ effectiveAtk\(source\)/);
    // The hero abilities' {bp:1/2}: 1 + half the Attack.
    for (const id of ['skill_silver', 'passive_haze_fixation', 'passive_drifter_bloodscent']) {
      const body = new RegExp(`const ${id}: HeroAbilityDef = \\{\\n([\\s\\S]*?)^\\};`, 'm').exec(abilitiesSource)?.[1] ?? '';
      expect(body, id).toMatch(/1 \+ Math\.floor\(\(?(?:source \? )?effectiveAtk\((?:source|self)\)/);
    }
  });

  it('the spells and ultimates the marks were written for print them', () => {
    expect(SPELLS.find((s) => s.id === 'cold_front')!.text).toBe('Deal {sp:2} spirit damage to enemy Active.');
    expect(ULTIMATES.find((u) => u.id === 'ult_seven')!.text).toBe("Channel 2 turns: at each turn's end, deal {sp:2} spirit damage to every enemy.");
    expect(ULTIMATES.find((u) => u.id === 'ult_vindicta')!.text).toBe('Fly 3 turns: 1 in 3 hits miss her; her attacks add {sp:1} spirit damage.');
  });

  it('Paige\'s Plot Armor says what the code grants: a Shield that grows with Spirit and +1 Attack', () => {
    expect(ABILITIES_BY_ID.skill_paige.text).toBe('Give one of your heroes Shield {sp:2} and +1 Attack for 2 turns.');
    expect(abilitiesSource).toMatch(/addStatus\(G, target, 'shield', 2 \+ spi\(source\), 999\)/);
    expect(abilitiesSource).toMatch(/addStatus\(G, target, 'weapon_power', 1, 2\)/);
  });
});
