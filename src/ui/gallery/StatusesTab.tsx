/**
 * Statuses — every chip the board can print, grouped by the colour it is
 * printed in, with what it does beside it. The registry's id follows the
 * name in the small register, for anyone matching a chip to the code. Each
 * chip explains itself on hover or tap as it does on a hero's tile. Under them,
 * every mark the statuses wear, at sticker size and at chip size — the ones
 * drawn ahead of the registry included.
 */
import { STATUSES, STATUSES_BY_ID, type StatusDef } from '@/statuses';
import { StatusIcon, statusClass, statusLabel, type StatusClass } from '../card/StatusIcon';
import { MARKED_IDS, StatusMark } from '../card/statusMarks';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { poster } from '../poster';
import { Section } from './primitives';

// A representative magnitude per status, so value chips show their pill.
const MAGNITUDE: Record<string, number> = {
  bullet_resist: 3, spirit_resist: 3, shield: 5,
  weapon_power: 2, spirit_power: 2, bleed: 3,
  fixation: 2, last_stand: 4,
};

const CLASSES: { id: StatusClass; title: string; aside: string }[] = [
  { id: 'buff', title: 'Buffs', aside: 'green' },
  { id: 'debuff', title: 'Debuffs', aside: 'red' },
  { id: 'utility', title: 'Utility', aside: 'ink' },
];

const valueOf = (s: StatusDef) => MAGNITUDE[s.id] ?? 1;

/** The ink a mark wears over its sticker: the class colour, paper for the
 *  statuses that are neither buff nor debuff. */
const stickerInk = (id: string) => {
  const c = statusClass(id);
  return c === 'utility' ? poster.paper : poster.status[c];
};

export function StatusesTab() {
  return (
    <>
      {CLASSES.map((c) => {
        const list = STATUSES.filter((s) => statusClass(s.id) === c.id);
        if (list.length === 0) return null;
        return (
          <Section key={c.id} title={c.title} count={list.length} aside={`printed in ${c.aside}`}>
            <div className="gal-status">
              {list.map((s) => (
                <div key={s.id} className="gal-status__row">
                  <div className="gal-status__chip">
                    <Explain content={statusContent(s.id, { value: valueOf(s), duration: 2 })} style={{ display: 'inline-flex' }}>
                      <StatusIcon id={s.id} value={valueOf(s)} duration={2} titled={false} />
                    </Explain>
                  </div>
                  <div className="gal-status__head">
                    <span className="gal-status__name">{s.title}</span>
                    <span className="gal-status__id">{s.id}</span>
                  </div>
                  <div className="gal-status__desc">{s.desc.replace(/<value>/g, String(valueOf(s)))}</div>
                </div>
              ))}
            </div>
          </Section>
        );
      })}
      <p className="gal-cap" style={{ marginTop: -8 }}>
        A chip reads mark, label, magnitude, then turns left in brackets. Statuses that are simply on or off
        (Stun, Silence, Disarm, Dome, Rooted, Rabbit) print no magnitude. Every status wears a small mark
        before its label &mdash; the one its sticker wears when it lands, with the turns it lasts beside it.
        Hover or tap a chip for what it does.
      </p>
      <Section title="Marks" count={MARKED_IDS.length} aside="sticker size · chip size">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '6px 14px' }}>
          {MARKED_IDS.map((id) => (
            <div key={id} data-mark-sample={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${poster.paperDeep}` }}>
              <div style={{ padding: 5, borderRadius: 3, background: 'linear-gradient(135deg, #5d6b78, #8f7556)' }}>
                <StatusMark id={id} color={stickerInk(id)} outline={poster.ink} size={34} />
              </div>
              <div style={{ padding: 3, borderRadius: 2, background: poster.status[statusClass(id)], border: `1px solid ${poster.ink}` }}>
                <StatusMark id={id} color={poster.cream} size={12} />
              </div>
              <div style={{ minWidth: 0, font: '700 11.5px/1.2 var(--g-ui)', color: poster.ink }}>
                {statusLabel(id)}
                <div style={{ font: '400 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace', color: poster.inkDim, overflowWrap: 'anywhere' }}>
                  {id}{STATUSES_BY_ID[id] ? '' : ' · not yet listed'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
