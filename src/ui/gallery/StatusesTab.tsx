/**
 * Statuses — every chip the board can print, grouped by the colour it is
 * printed in, with what it does beside it. The registry's id follows the
 * name in the small register, for anyone matching a chip to the code.
 */
import { STATUSES, type StatusDef } from '@/statuses';
import { StatusIcon, statusClass, type StatusClass } from '../card/StatusIcon';
import { Section } from './primitives';

// A representative magnitude per status, so value chips show their pill.
const MAGNITUDE: Record<string, number> = {
  bullet_resist: 3, spirit_resist: 3, shield: 5,
  weapon_power: 2, spirit_power: 2, bleed: 3,
};

const CLASSES: { id: StatusClass; title: string; aside: string }[] = [
  { id: 'buff', title: 'Buffs', aside: 'green' },
  { id: 'debuff', title: 'Debuffs', aside: 'red' },
  { id: 'utility', title: 'Utility', aside: 'ink' },
];

const valueOf = (s: StatusDef) => MAGNITUDE[s.id] ?? 1;

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
                  <div className="gal-status__chip"><StatusIcon id={s.id} value={valueOf(s)} duration={2} /></div>
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
        A chip reads label, magnitude, then turns left in brackets. Statuses that are simply on or off
        (Stun, Silence, Disarm) print no magnitude.
      </p>
    </>
  );
}
