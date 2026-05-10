import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Oralign — Aligner Case Management Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          fontFamily: "Georgia, serif",
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
            fontWeight: 500,
          }}
        >
          ORALIGN
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 620, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 18, letterSpacing: 6, color: "#f5c842", textTransform: "uppercase", marginBottom: 28 }}>
            Aligner Case Management Platform
          </div>
          <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 300 }}>
            Digital aligner{" "}
            <span style={{ fontStyle: "italic", color: "#f5c842" }}>case management,</span>
          </div>
          <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 500, marginTop: 4 }}>
            built for modern dentists.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
