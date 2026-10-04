/**
 * Combat FX — transient feedback: what the match draws when something
 * happens. The stage and its triggers are the FX showroom; the two
 * full-screen reveals are listed with them, and the two persistent card
 * looks that belong to a fight sit underneath.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { HEROES } from '@/cards';
import { HeroSlot } from '../board/HeroSlot';
import { CardPlayOverlay } from '../effects/CardPlayFlash';
import { UltFlashOverlay } from '../effects/UltMomentFlash';
import { FxShowroom, type ExtraGroup } from './FxShowroom';
import { mockHeroInstance } from './mock';
import { Section, Caption, Notes, Row, Button, Chip, Sub } from './primitives';

export function CombatTab() {
  const extra: ExtraGroup[] = [
    {
      id: 'flash', short: 'Card flash',
      title: 'Card-play flash',
      blurb: 'Full screen. A spell or equipment played from hand, or a hero using a skill: the card sits on screen for about 1.7 s with a caption.',
      body: (
        <>
          <CardPlayTrigger label="You — Spell" cardId="cold_front" caster="P0" />
          <CardPlayTrigger label="You — Equipment" cardId="restorative_shot" caster="P0" />
          <CardPlayTrigger label="You — Skill" cardId="hero_paige" caster="P0" kind="skill" />
          <CardPlayTrigger label="Rival — Spell" cardId="disarming_hex" caster="P1" />
          <CardPlayTrigger label="Rival — Equipment" cardId="weapon_shielding" caster="P1" />
          <CardPlayTrigger label="Rival — Skill" cardId="hero_kelvin" caster="P1" kind="skill" />
        </>
      ),
    },
    {
      id: 'ult', short: 'Ult moment',
      title: 'Ultimate moment',
      blurb: 'Full screen. The fill on an ultimate cast: gold for you, wine for the rival. It pairs with the card-play flash on a real cast.',
      body: (
        <>
          <UltTrigger label="You — Seismic Impact" name="Seismic Impact" caster="P0" />
          <UltTrigger label="You — Rallying Charge" name="Rallying Charge" caster="P0" />
          <UltTrigger label="Rival — Death Slam" name="Death Slam" caster="P1" />
          <UltTrigger label="Rival — Soul Exchange" name="Soul Exchange" caster="P1" />
        </>
      ),
    },
  ];

  return (
    <>
      <Notes label="What the stage draws">
        <p>
          The table is seen from straight above, and effects have height. Everything the engine resolves is
          played three ways at once: prints on the cards (washes of light off the impact, bullet holes, the
          rune, stickers slammed on, the amount in stencil digits), things in the air on the FX stage (a
          bolt arcing over the board with its shadow under it, tracers, brass casings bouncing on the
          paper, sparks and chads of the print flung up and falling back, embers winding toward you), and
          the cards themselves &mdash; a hit rocks the tile off the table, a shooter kicks back with each
          round, a caster lifts while it gathers power, a shockwave bobs every card it passes under.
        </p>
        <p>
          Two effects take the card itself apart: a pure hit tears it in two for a moment, and a kill
          breaks it into shards &mdash; clones of the live tile, cut along the cracks &mdash; before the
          K.O. sticker is slammed onto what is left. Every tagged effect still has a lead-in of its own:
          Djinn&rsquo;s Mark converging and detonating, Mystic Reverb ringing in, Naptime&rsquo;s letters, a
          Killing Blow&rsquo;s slashes, Ricochet bounces, Tesla arcs, channel shockwaves.
        </p>
        <p>
          The stage keeps a mock HP that follows the hits, so the hold can be seen: the number, the chips and
          the corpse look on a struck card wait until the bolt lands, and a kill turns into the corpse under
          the shatter. Calm motion is what a reduced-motion player sees: the prints and the numbers on the
          same beats, and nothing flies.
        </p>
      </Notes>

      <FxShowroom extra={extra} />

      <div className="gal-cols2">
        <Section title="Rem merge" aside="Lil Helpers">
          <RemMergeDemo />
        </Section>
        <Section title="HP / BP tick">
          <StatTickDemo />
        </Section>
      </div>
    </>
  );
}

/** Mount an overlay for a fixed window, then unmount it so it can replay. */
function AutoExit({ ms, onDone, children }: { ms: number; onDone: () => void; children: ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [ms, onDone]);
  return <>{children}</>;
}

function CardPlayTrigger({ label, cardId, caster, kind = 'play' }: {
  label: string; cardId: string; caster: 'P0' | 'P1'; kind?: 'play' | 'skill';
}) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Chip onClick={() => setActive(true)} disabled={active} on={active}>{label}</Chip>
      <AnimatePresence>
        {active && (
          <AutoExit ms={1700} onDone={() => setActive(false)}>
            <CardPlayOverlay cardId={cardId} caster={caster} kind={kind} />
          </AutoExit>
        )}
      </AnimatePresence>
    </>
  );
}

function UltTrigger({ label, name, caster }: { label: string; name: string; caster: 'P0' | 'P1' }) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Chip onClick={() => setActive(true)} disabled={active} on={active}>{label}</Chip>
      <AnimatePresence>
        {active && (
          <AutoExit ms={2400} onDone={() => setActive(false)}>
            <UltFlashOverlay name={name} caster={caster} />
          </AutoExit>
        )}
      </AnimatePresence>
    </>
  );
}

function StatTickDemo() {
  // Mock a Paige instance and let the demo mutate hp / atkMod directly so
  // the on-card animation (driven by useStatTick inside HeroSlot) fires
  // exactly the same way it does in a real match.
  const paige = HEROES.find((h) => h.id === 'hero_paige')!;
  const [hp, setHp] = useState(paige.hp);
  const [atkMod, setAtkMod] = useState(0);
  const card: CardInstance = {
    ...mockHeroInstance(paige),
    hp, hpMax: paige.hp, atkMod,
  };
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 132, aspectRatio: '3 / 4', flexShrink: 0 }}>
        <HeroSlot
          card={card}
          owner="0" myId="0" isOpponent={false}
          pending={null} isTargetable={false}
          isCurrentTurn={false}
          compact
          onTap={() => {}}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <Caption>
          Damage and heals animate on the card&rsquo;s own number: a quick pulse in the stat&rsquo;s colour
          family, ink for BP and red for HP. A buff pulses brighter, damage pulses grey.
        </Caption>
        <Sub title="Health" />
        <Row>
          <Button onClick={() => setHp((v) => Math.max(0, v - 1))}>−1 HP</Button>
          <Button onClick={() => setHp((v) => Math.max(0, v - 3))}>−3 HP</Button>
          <Button onClick={() => setHp((v) => Math.min(paige.hp, v + 1))}>+1 HP</Button>
          <Button onClick={() => setHp(paige.hp)}>Full heal</Button>
        </Row>
        <Sub title="Bullet Power" />
        <Row>
          <Button onClick={() => setAtkMod((v) => v + 1)}>+1 BP</Button>
          <Button onClick={() => setAtkMod((v) => v - 1)}>−1 BP</Button>
          <Button onClick={() => setAtkMod(0)}>Reset</Button>
        </Row>
      </div>
    </div>
  );
}

function RemMergeDemo() {
  const bearer = HEROES.find((h) => h.id === 'hero_dynamo')!;
  const rem = HEROES.find((h) => h.id === 'hero_rem')!;
  const baseBearer = mockHeroInstance(bearer);
  const remMerged: CardInstance = {
    ...mockHeroInstance(rem),
    zone: 'equipment',
    attachedTo: 'preview-bearer',
    remMergeTurnsLeft: 3,
    remMergeHpBuff: 2,
  };
  const bearerCard: CardInstance = {
    ...baseBearer,
    iid: 'preview-bearer',
    hpMax: baseBearer.hpMax + 2,
    hp: baseBearer.hpMax + 2,
    attached: [remMerged],
  };
  const remBench: CardInstance = { ...mockHeroInstance(rem), iid: 'preview-rem-bench', zone: 'bench', slot: 1 };
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ width: 150, aspectRatio: '3 / 4', flexShrink: 0 }}>
        <HeroSlot card={bearerCard} owner="0" myId="0" isOpponent={false}
          pending={null} isTargetable={false} isCurrentTurn onTap={() => {}} />
      </div>
      <div style={{ width: 110, aspectRatio: '3 / 4', flexShrink: 0 }}>
        <HeroSlot card={remBench} owner="0" myId="0" isOpponent={false} compact
          pending={null} isTargetable={false} isCurrentTurn onTap={() => {}} />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0, alignSelf: 'flex-start' }}>
        <Caption>
          Rem&rsquo;s skill merges her into an ally as a temporary buff.
        </Caption>
        <Caption>
          <strong>Left</strong>, the carry: her portrait badge with a countdown of 3, a green buff border, and
          +2 max HP. <strong>Right</strong>, Rem on the bench with the skill-ready glint, because she casts
          from the bench.
        </Caption>
      </div>
    </div>
  );
}
