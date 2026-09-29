/**
 * Foil Showroom — a prototype bench for the rarity-4 premium print finish,
 * parked in the Gallery so the treatments can be compared against the matte
 * card they would replace before any of it reaches a match.
 *
 * Why it exists in this shape: the obvious reference for "make rare cards
 * special" is pokemon-cards-css, which is GPL-3.0 (this project is MIT) and
 * models a laminated holofoil that fights the screen-print idiom besides. So
 * this is the print-shop answer instead — an extra metallic-ink plate and a
 * clear spot varnish, written here from scratch. See SpotVarnish.tsx for the
 * two rules that keep it foil rather than holo.
 *
 * The settings ride in a bar that stays under the masthead, because every
 * card below takes them and a control that has scrolled away cannot be
 * compared against anything.
 *
 * Nothing here is wired into gameplay: CardFrame's `foil` prop defaults to
 * null, and only this tab passes it.
 */
import { useRef, useState } from 'react';
import { CardFrame } from '../card/CardFrame';
import {
  type Foil, type Holo, type HoloScope, type HoloStrength, type HoloPalette,
  isPattern, useFoilSweepAllowed,
} from '../card/SpotVarnish';
import { ULTIMATES, EQUIPMENT } from '@/cards';
import {
  Section, Caption, Notes, Button, CardGrid, Fit, Segmented, Toggle,
} from './primitives';
import { useViewport } from '../hooks/useViewport';

type Choice = Foil | 'matte';

const CHOICES: { id: Choice; label: string; blurb: string }[] = [
  { id: 'matte', label: 'Matte',  blurb: 'What ships today — one flat plate, no finish.' },
  { id: 'stamp', label: 'Stamp',  blurb: 'Metallic ink on the keyline, the type band and the name.' },
  { id: 'gloss', label: 'Gloss',  blurb: 'Clear spot varnish on the two bands. No colour of its own.' },
  { id: 'both',  label: 'Both',   blurb: 'The full premium finish — metal plus varnish.' },
];

const asFoil = (c: Choice): Foil | null => (c === 'matte' ? null : c);

type HoloChoice = Holo | 'none';
const HOLOS: { id: HoloChoice; label: string; blurb: string }[] = [
  { id: 'none',     label: 'None',     blurb: 'No iridescence.' },
  { id: 'cosmos',   label: 'Cosmos',   blurb: 'The base-set bubble field. Organic rather than tiled, so it is turbulence \u2014 the same noise source as the backdrop grain \u2014 pushed into blobs.' },
  { id: 'sigil',    label: 'Sigil',    blurb: 'The game\u2019s own marks in a lattice: bullet, spirit flame, shield, heart \u2014 the four things every card is measured in.' },
  { id: 'wordmark', label: 'Wordmark', blurb: 'The Deadlock lettering tiled small, the way a modern set stamps its own symbol into the foil. Masked from the ink wordmark already on the title sheet.' },
  { id: 'tinsel',   label: 'Tinsel',   blurb: 'Angled sliver sparkle \u2014 a gradient masking a gradient, the cheapest of the seven.' },
  { id: 'split',    label: 'Split',    blurb: 'Split-fountain rainbow roll — a real one-pass screen print, in the poster\u2019s own inks. Pigment, so it never outshines the ink.' },
  { id: 'halftone', label: 'Halftone', blurb: 'The spectrum masked into a 5px dot screen, so the print\u2019s own halftone carries the shimmer instead of a coating.' },
  { id: 'rainbow',  label: 'Rainbow',  blurb: 'The laminated holofoil: full spectrum on color-dodge, swept by angle. The reference look.' },
];
const asHolo = (c: HoloChoice): Holo | null => (c === 'none' ? null : c);

const MARK_SCALES: { id: string; label: string; v: number }[] = [
  { id: 'fine',  label: 'Fine',  v: 0.6 },
  { id: 'even',  label: 'Even',  v: 1 },
  { id: 'bold',  label: 'Bold',  v: 1.7 },
];

const PALETTES: { id: HoloPalette; label: string; blurb: string }[] = [
  { id: 'amber',   label: 'Amber \u00b7 teal', blurb: 'The game\u2019s own world: teal night against amber lamps, sampled from the backdrop scene.' },
  { id: 'brass',   label: 'Brass',   blurb: 'Gold foil only \u2014 brass to cream and back. The quietest, and the one that matches the stamped type exactly.' },
  { id: 'inks',    label: 'Inks',    blurb: 'The poster\u2019s printing inks: red, gold, cream, green, blue, purple.' },
  { id: 'rainbow', label: 'Rainbow', blurb: 'The Pok\u00e9mon palette. Kept as the reference look; it is not this game\u2019s.' },
];

const STRENGTHS: { id: HoloStrength; label: string }[] = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

const SCOPES: { id: HoloScope; label: string }[] = [
  { id: 'art',  label: 'Art window' },
  { id: 'card', label: 'Whole card' },
];

// Four premium items that between them exercise a long name, a two-line rule
// and a short one, so the stamped type is judged at its worst as well as best.
const T4_SAMPLE = ['diviners_kevlar', 'transcendent_cooldown', 'leech', 'escalating_exposure'];

export function FoilShowroom() {
  const { isMobile } = useViewport();
  const [choice, setChoice] = useState<Choice>('both');
  const [holoChoice, setHolo] = useState<HoloChoice>('split');
  const [scope, setScope] = useState<HoloScope>('art');
  const [strength, setStrength] = useState<HoloStrength>('medium');
  const [markId, setMarkId] = useState('even');
  const [palette, setPalette] = useState<HoloPalette>('amber');
  const [tilt, setTilt] = useState(true);
  // A phone cannot spare a fifth of its height for seven rows of plates, so
  // there the bar folds to one line that names the current finish.
  const [open, setOpen] = useState(!isMobile);
  const sweepAllowed = useFoilSweepAllowed();
  const stage = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  /** Turn every card on the sheet through the light at once. Cards write their
   *  own --px only while hovered, so driving it here reaches all of them —
   *  which is also how a phone, with no pointer at all, would ever see the
   *  metal move. */
  const sweepAll = (ms = 1100) => {
    const el = stage.current;
    if (!el || !sweepAllowed) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      el.style.setProperty('--px', (1 - Math.pow(1 - k, 3)).toFixed(4));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else { raf.current = null; el.style.removeProperty('--px'); }
    };
    raf.current = requestAnimationFrame(step);
  };

  const foil = asFoil(choice);
  const holo = asHolo(holoChoice);
  // Everything below takes the same settings; bundled so a call site cannot
  // accidentally show one card under different rules than its neighbour.
  const markScale = MARK_SCALES.find((m) => m.id === markId)!.v;
  const fx = {
    foil, holo, holoScope: scope, holoStrength: strength, holoMarkScale: markScale,
    holoPalette: palette, tilt,
  };
  const patterned = !!holo && isPattern(holo);
  const finish = CHOICES.find((c) => c.id === choice)!;
  const holoOf = HOLOS.find((c) => c.id === holoChoice)!;
  const colour = PALETTES.find((c) => c.id === palette)!;

  // The four judged at close range lead the set, so the worst cases for the
  // stamped type (a long name, a two-line rule) are the first thing seen.
  const t4Gear = EQUIPMENT.filter((e) => e.rarity === 4);
  const t4 = [
    ...T4_SAMPLE.map((id) => t4Gear.find((e) => e.id === id)).filter((e) => !!e),
    ...t4Gear.filter((e) => !T4_SAMPLE.includes(e.id)),
  ] as typeof t4Gear;

  const controls = (
    <>
      <Segmented label="Finish" value={choice} onChange={setChoice} options={CHOICES} />
      <Segmented label="Holo" value={holoChoice} onChange={setHolo} options={HOLOS} />
      <Segmented label="Colour" value={palette} onChange={setPalette} options={PALETTES} />
      <Segmented label="Area" value={scope} onChange={setScope} options={SCOPES} />
      <Segmented label="Strength" value={strength} onChange={setStrength} options={STRENGTHS} />
      {patterned && <Segmented label="Tile" value={markId} onChange={setMarkId} options={MARK_SCALES} />}
      <Toggle label="Motion" on={tilt} onChange={setTilt}>3D tilt {tilt ? 'on' : 'off'}</Toggle>
      <Button onClick={() => sweepAll()} disabled={!sweepAllowed || (choice === 'matte' && !holo)}>
        Turn in the light
      </Button>
    </>
  );

  return (
    <div ref={stage}>
      <div className="gal-bar" style={isMobile ? { gap: '8px 14px' } : undefined}>
        {isMobile && (
          <button type="button" className="gal-bar__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span>{finish.label} · {holoOf.label} · {colour.label} · {SCOPES.find((x) => x.id === scope)!.label}</span>
            <span>{open ? 'Close' : 'Settings'}</span>
          </button>
        )}
        {(open || !isMobile) && controls}
      </div>

      <div className="gal-cols2" style={{ marginBottom: 14 }}>
        <div>
          <Caption><strong>Finish · {finish.label}.</strong> {finish.blurb}</Caption>
          <Caption><strong>Holo · {holoOf.label}.</strong> {holoOf.blurb}</Caption>
          <Caption>
            <strong>Colour · {colour.label}.</strong> {colour.blurb}
            {scope === 'card' && holo && ' Over the whole card it washes the rules text too; check that before choosing it.'}
          </Caption>
        </div>
        <div>
          <Notes label="The proposal">
            <p>
              A print shop does not make one sheet in a run feel expensive by laminating it. It adds a plate:
              metallic ink over chosen type, and a clear varnish over chosen panels. Light catches only where
              those plates went down, so the card stays a screen print that was finished expensively. That is
              what this is: one gold hue in light-and-dark reversals (never a hue sweep, which is what reads as
              holofoil), and every layer masked to the plate it models. The art window is never touched.
            </p>
            <p>
              Tilt and iridescence sit on the same two pointer variables as the foil, so the metal catches light{' '}
              <em>because</em> the card turned, rather than alongside it. Move the pointer across a card, or
              press Turn in the light to sweep the whole sheet. That sweep is also the only way any of this
              moves on a phone.
            </p>
            <p>
              The first three holos are washes: the iridescence covers the plate evenly. The last four are
              patterns, where it lives inside a repeated motif, and that is the difference between a card that
              looks laminated and one that looks foil-<em>stamped</em>. Mechanically a pattern is the halftone
              with a different mask, so each costs a mask swap and nothing else.
            </p>
          </Notes>
          {!sweepAllowed && (
            <Caption>
              Reduced motion is on, so the scripted sweep is off. Pointer tilt and the metal still respond,
              because following a cursor is direct manipulation rather than animation.
            </Caption>
          )}
        </div>
      </div>

      <div className="gal-cols2">
        <Section title="Colour" count={PALETTES.length} aside="the same holo, four palettes">
          <CardGrid pack="start" gap={12}>
            {PALETTES.map((pl) => (
              <Fit key={pl.id} label={pl.label}>
                <CardFrame cardId="ult_kelvin" size="hand" {...fx} holo={holo ?? 'rainbow'} holoPalette={pl.id} />
              </Fit>
            ))}
          </CardGrid>
        </Section>

        <Section title="Finish" count={CHOICES.length} aside="one card, four finishes">
          <CardGrid pack="start" gap={12}>
            {CHOICES.map((c) => (
              <Fit key={c.id} label={c.label}>
                <CardFrame cardId="ult_lash" size="hand" {...fx} foil={asFoil(c.id)} />
              </Fit>
            ))}
          </CardGrid>
        </Section>
      </div>

      <Section title="Holo" count={HOLOS.length - 1} aside="none, then three washes and four patterns">
        <CardGrid pack="start" gap={12}>
          {HOLOS.map((h) => (
            <Fit key={h.id} label={h.label}>
              <CardFrame cardId="ult_haze" size="hand" {...fx} holo={asHolo(h.id)} />
            </Fit>
          ))}
        </CardGrid>
      </Section>

      <div className="gal-cols2">
        <Section title="Against the lower rarities" aside="the finish is on the last card only">
          <CardGrid pack="start" gap={12}>
            <Fit label="Tier 1"><CardFrame cardId="extra_health" size="hand" /></Fit>
            <Fit label="Tier 2"><CardFrame cardId="titanic_magazine" size="hand" /></Fit>
            <Fit label="Tier 3"><CardFrame cardId="superior_cooldown" size="hand" /></Fit>
            <Fit label="Tier 4"><CardFrame cardId="transcendent_cooldown" size="hand" {...fx} /></Fit>
          </CardGrid>
        </Section>

        <Section title="Large format" aside="the long-press view">
          <div className="gal-scroller gal-scroller--bleed">
            <CardFrame cardId="ult_rem" size="full" {...fx} />
            <CardFrame cardId="leech" size="full" {...fx} />
          </div>
        </Section>
      </div>

      <Section title="Ultimates" count={ULTIMATES.length} aside="every one is rarity 4">
        <Caption>The real test is the grid: a finish that charms on one card can turn a whole sheet noisy.</Caption>
        <CardGrid>
          {ULTIMATES.map((u) => (
            <Fit key={u.id}><CardFrame cardId={u.id} size="hand" {...fx} /></Fit>
          ))}
        </CardGrid>
      </Section>

      <Section title="Tier-4 equipment" count={t4.length} aside="the same rarity, so the same plate">
        <CardGrid>
          {t4.map((e) => (
            <Fit key={e.id}><CardFrame cardId={e.id} size="hand" {...fx} /></Fit>
          ))}
        </CardGrid>
      </Section>
    </div>
  );
}
