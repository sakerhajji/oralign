import { ImageResponse } from 'next/og';

// Rendered once at build on the Node runtime (the default). It used to run
// on the edge per request, where an invalid Satori layout threw every time —
// production answered 502 and shared links went out without a card.
export const alt = 'Oralign — Clear aligner care platform';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Root-level OG image — shown by Google, Twitter, WhatsApp, LinkedIn,
 * etc. when a URL WITHOUT its own OpenGraph image is shared — /login,
 * /signup and the like. Every marketing page names /og.png explicitly.
 *
 * Brand palette mirrors the marketing site (oralign yellow #FECA16
 * on near-black). No external assets — pure ImageResponse, so the
 * image never depends on a network fetch. Marketing pages use the
 * static /og.png card instead (seo/meta.ts → OG_IMAGE).
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0a',
          color: '#f8f6f2',
          display: 'flex',
          padding: 80,
          position: 'relative',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 540,
            height: 540,
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 40% 35%, #fde383 0%, #feca16 60%, #c79b00 100%)',
            boxShadow: '0 0 80px rgba(254,202,22,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0a0a0a',
            fontSize: 64,
            letterSpacing: 8,
            fontWeight: 700,
          }}
        >
          ORALIGN
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            maxWidth: 620,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 18,
              letterSpacing: 6,
              color: '#feca16',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            Clear aligner care platform
          </div>
          {/* Satori requires display:flex on any element with several children;
              without it the render throws, which is what made this route 502. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: 64, lineHeight: 1.05, fontWeight: 300 }}>
            Doctor-supervised&nbsp;
            <span style={{ fontStyle: 'italic', color: '#feca16' }}>
              orthodontic care,
            </span>
          </div>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.05,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            built in Tunisia.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
