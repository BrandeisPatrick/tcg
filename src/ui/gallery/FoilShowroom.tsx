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
 * One card at a time. Pick the card, pick the finish, and the stage shows
 * that card — beside its own matte print when Compare is on, so never more
 * than two. A finish is a stack of blended layers (and, for Cosmos, a
 * turbulence filter), and the earlier sheet that drew every rarity-4 card in
 * it at once could stall the tab. The settings ride in a bar that stays
 * under the masthead, so they are never a scroll away from the card.
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
import { ULTIMATES, EQUIPMENT, CARDS_BY_ID } from '@/cards';
import {
  Caption, Notes, Button, Segmented, Toggle, useWidth, HAND, FULL,
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

type SizeId = 'full' | 'hand';
const SIZES: { id: SizeId; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'hand', label: 'Hand' },
];

// The finish is for rarity 4 only: every ultimate, and the tier-4 equipment.
const T4_GEAR = EQUIPMENT.filter((e) => e.rarity === 4);
const CARD_IDS = [...ULTIMATES, ...T4_GEAR].map((c) => c.id);
const ultLabel = (u: (typeof ULTIMATES)[number]) => {
  const hero = CARDS_BY_ID[u.linkedHero]?.name;
  return hero ? `${u.name} · ${hero}` : u.name;
};

const STAGE_GAP = 28;

export function FoilShowroom() {
  const { isMobile } = useViewport();
  const [cardId, setCardId] = useState('ult_kelvin');
  const [size, setSize] = useState<SizeId>('full');
  const [compare, setCompare] = useState(true);
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
  const [stage, stageW] = useWidth<HTMLDivElement>();
  const raf = useRef<number | null>(null);

  /** Turn the card through the light. A card writes its own --px only while
   *  hovered, so driving it from the stage is how a phone, with no pointer
   *  at all, ever sees the metal move. */
  const sweep = (ms = 1100) => {
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
  const markScale = MARK_SCALES.find((m) => m.id === markId)!.v;
  const fx = {
    foil, holo, holoScope: scope, holoStrength: strength, holoMarkScale: markScale,
    holoPalette: palette, tilt,
  };
  const patterned = !!holo && isPattern(holo);
  const finish = CHOICES.find((c) => c.id === choice)!;
  const holoOf = HOLOS.find((c) => c.id === holoChoice)!;
  const colour = PALETTES.find((c) => c.id === palette)!;
  const cardName = CARDS_BY_ID[cardId]?.name ?? cardId;

  /** Step to the neighbouring card, wrapping at either end. */
  const step = (by: number) => {
    const i = CARD_IDS.indexOf(cardId);
    setCardId(CARD_IDS[(i + by + CARD_IDS.length) % CARD_IDS.length]);
  };

  // The stage holds one card or two, at the size picked — scaled down as a
  // pair only where two will not fit side by side (a phone).
  const dims = size === 'full' ? FULL : HAND;
  const shown = compare ? 2 : 1;
  const scale = stageW > 0 ? Math.min(1, (stageW - STAGE_GAP * (shown - 1)) / (dims.w * shown)) : 1;
  const slot = (label: string, card: React.ReactNode) => (
    <figure style={{ margin: 0, width: dims.w * scale }}>
      <div style={{ width: dims.w * scale, height: dims.h * scale }}>
        <div style={{ width: dims.w, height: dims.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {card}
        </div>
      </div>
      <figcaption className="gal-figcap">{label}</figcaption>
    </figure>
  );

  const picker = (
    <div className="gal-seg" role="group" aria-label="Card">
      <span className="gal-seg__label" aria-hidden>Card</span>
      <Button onClick={() => step(-1)} title="Previous card">←</Button>
      <select
        className="gal-select"
        value={cardId}
        onChange={(e) => setCardId(e.target.value)}
        aria-label="Card"
        style={{ minWidth: 0, flex: '1 1 auto' }}
      >
        <optgroup label="Ultimates">
          {ULTIMATES.map((u) => <option key={u.id} value={u.id}>{ultLabel(u)}</option>)}
        </optgroup>
        <optgroup label="Tier-4 equipment">
          {T4_GEAR.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </optgroup>
      </select>
      <Button onClick={() => step(1)} title="Next card">→</Button>
    </div>
  );

  const controls = (
    <>
      {picker}
      <Segmented label="Finish" value={choice} onChange={setChoice} options={CHOICES} />
      <Segmented label="Holo" value={holoChoice} onChange={setHolo} options={HOLOS} />
      <Segmented label="Colour" value={palette} onChange={setPalette} options={PALETTES} />
      <Segmented label="Area" value={scope} onChange={setScope} options={SCOPES} />
      <Segmented label="Strength" value={strength} onChange={setStrength} options={STRENGTHS} />
      {patterned && <Segmented label="Tile" value={markId} onChange={setMarkId} options={MARK_SCALES} />}
      <Segmented label="Size" value={size} onChange={setSize} options={SIZES} />
      <Toggle label="Compare" on={compare} onChange={setCompare}>Beside matte {compare ? 'on' : 'off'}</Toggle>
      <Toggle label="Motion" on={tilt} onChange={setTilt}>3D tilt {tilt ? 'on' : 'off'}</Toggle>
      <Button onClick={() => sweep()} disabled={!sweepAllowed || (choice === 'matte' && !holo)}>
        Turn in the light
      </Button>
    </>
  );

  return (
    <div>
      <div className="gal-bar" style={isMobile ? { gap: '8px 14px' } : undefined}>
        {isMobile && (
          <button type="button" className="gal-bar__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span>{cardName} · {finish.label} · {holoOf.label} · {colour.label}</span>
            <span>{open ? 'Close' : 'Settings'}</span>
          </button>
        )}
        {(open || !isMobile) && controls}
      </div>

      {/* The stage: the picked card in the picked finish and, with Compare
          on, the same card as it ships today. Two cards at most. */}
      <div
        ref={stage}
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          gap: STAGE_GAP, margin: '6px 0 22px',
          // Until it is measured there is nothing to scale against.
          visibility: stageW > 0 ? 'visible' : 'hidden',
        }}
      >
        {slot(`${finish.label}${holo ? ` · ${holoOf.label}` : ''}`, <CardFrame cardId={cardId} size={size} {...fx} />)}
        {compare && slot('Matte, as it ships', <CardFrame cardId={cardId} size={size} />)}
      </div>

      <div className="gal-cols2">
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
              <em>because</em> the card turned, rather than alongside it. Move the pointer across the card, or
              press Turn in the light to sweep it. That sweep is also the only way any of this moves on a
              phone.
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

    </div>
  );
}
