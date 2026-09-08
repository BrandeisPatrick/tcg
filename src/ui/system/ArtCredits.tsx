/**
 * The art credits, printed on paper: one row per outside piece — a small
 * framed print (or a type specimen), what it is, who made it, where the game
 * puts it and where to find the original. Mounted inside the System sheet
 * and on the Gallery's Credits tab; the list itself lives in
 * src/art/credits.ts.
 */
import { fonts, text } from '../tokens';
import { poster, printEdge } from '../poster';
import { ART_CREDITS, ART_DISCLAIMER, ORIGINAL_ART_NOTE, type ArtCredit, type CreditThumb } from '@/art/credits';

export function ArtCredits({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 20 : 28 }}>
      <p style={{ ...text.body, margin: 0, color: poster.inkDim, maxWidth: 640 }}>
        Everything the game shows that wasn't drawn for it: what it is, where it came
        from, and whose it is.
      </p>

      {ART_CREDITS.map((group) => (
        <section key={group.id} aria-label={group.title}>
          <h3
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: poster.inkDim,
            }}
          >
            {group.title}
          </h3>
          <p style={{ ...text.body, margin: '6px 0 10px', color: poster.ink, maxWidth: 640 }}>
            {group.blurb}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.items.map((item) => (
              <CreditRow key={item.id} item={item} compact={compact} />
            ))}
          </ul>
        </section>
      ))}

      <div
        style={{
          paddingTop: 14,
          borderTop: `1.5px solid ${poster.ink}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxWidth: 720,
        }}
      >
        <p style={{ ...text.body, margin: 0, color: poster.ink }}>{ORIGINAL_ART_NOTE}</p>
        <p style={{ ...text.body, margin: 0, fontSize: 12, color: poster.inkDim }}>{ART_DISCLAIMER}</p>
      </div>
    </div>
  );
}

/** One piece: its print, then title, maker, placement, links and terms. */
function CreditRow({ item, compact }: { item: ArtCredit; compact: boolean }) {
  const w = compact ? 76 : 100;
  const h = compact ? 56 : 70;
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: `${w}px minmax(0, 1fr)`,
        gap: compact ? 12 : 18,
        alignItems: 'start',
        padding: compact ? '10px 0' : '12px 0',
        borderTop: `1px solid ${poster.inkRule}`,
      }}
    >
      <Thumb thumb={item.thumb} width={w} height={h} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: compact ? 14 : 16,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            lineHeight: 1.15,
            color: poster.ink,
          }}
        >
          {item.title}
        </div>
        <div style={{ ...text.body, fontSize: compact ? 12 : 13, color: poster.ink }}>{item.by}</div>
        <div style={{ ...text.body, fontSize: compact ? 11.5 : 12.5, color: poster.inkDim }}>{item.where}</div>
        {item.links.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 2 }}>
            {item.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  ...text.label,
                  fontSize: 10.5,
                  letterSpacing: '0.12em',
                  color: poster.ink,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        )}
        <div style={{ ...text.body, fontSize: 11, lineHeight: 1.4, color: poster.inkDim }}>{item.terms}</div>
      </div>
    </li>
  );
}

/** The print in the charcoal frame every card on the table wears; type
 *  faces show a specimen on paper instead. Decorative. */
function Thumb({ thumb, width, height }: { thumb: CreditThumb; width: number; height: number }) {
  const ground = thumb.kind === 'image' ? (thumb.ground ?? '#0f1214') : poster.paper;
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        padding: 3,
        borderRadius: 8,
        background: poster.frame,
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 5,
          overflow: 'hidden',
          background: ground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb.kind === 'image' ? (
          <img
            src={thumb.src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: thumb.fit ?? 'cover',
              objectPosition: thumb.position ?? '50% 30%',
              padding: thumb.fit === 'contain' ? 6 : 0,
              userSelect: 'none',
            }}
          />
        ) : (
          <span style={{ fontFamily: thumb.family, fontSize: Math.round(height * 0.52), lineHeight: 1, color: poster.ink }}>
            {thumb.sample}
          </span>
        )}
        <div style={{ position: 'absolute', inset: 0, boxShadow: printEdge, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
