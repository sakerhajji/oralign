import { ImageResponse } from "next/og";

/**
 * /og.png — the social card of every public page (OG_IMAGE in seo/meta.ts).
 *
 * Replaces the file-convention opengraph-image of the showcase, which had two
 * problems: its layout broke Satori (a multi-child div without flex), so the
 * route answered 502 in production; and it still sold the old B2B "case
 * management" pitch to patients. Rendered once at build time on the Node
 * runtime, so a layout error now fails the build instead of the share.
 * French and Latin script only: the default font has no Arabic glyphs.
 */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          color: "#f8f6f2",
          display: "flex",
          padding: 80,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: "50%",
            transform: "translateY(-50%)",
            width: 540,
            height: 540,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, #f9d96a 0%, #f5c842 60%, #e8a820 100%)",
            boxShadow: "0 0 80px rgba(245,200,66,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0a0a0a",
            fontSize: 64,
            letterSpacing: 8,
            fontWeight: 700,
          }}
        >
          ORALIGN
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 640,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 20,
              letterSpacing: 6,
              color: "#f5c842",
              textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
            ORALIGN® Tunisie
          </div>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 300 }}>Aligneurs transparents</div>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 700, color: "#f5c842", marginTop: 4 }}>
            en Tunisie.
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.4, marginTop: 36, color: "#d9d6cf" }}>
            Conçus en Allemagne, fabriqués en Tunisie, suivis par un praticien partenaire.
          </div>
          <div style={{ fontSize: 20, marginTop: 40, color: "#8f8b83", letterSpacing: 2 }}>oralign.com.tn</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
