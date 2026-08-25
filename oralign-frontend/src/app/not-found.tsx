import Link from "next/link";

/**
 * Global 404. Served with a real 404 status (Next handles that), which
 * is what keeps dead URLs OUT of the index — before this file existed
 * the framework's default page served instead, unbranded.
 * Bilingual static copy: this renders outside both language providers.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        background: "#0a0a0a",
        color: "#f2f5ef",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <p
        style={{
          fontSize: "0.7rem",
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          color: "#feca16",
        }}
      >
        ORALIGN
      </p>
      <h1 style={{ fontSize: "clamp(2.4rem, 6vw, 4rem)", fontWeight: 300, lineHeight: 1.1 }}>
        404
      </h1>
      <p style={{ maxWidth: 420, lineHeight: 1.7, color: "rgba(242,245,239,0.75)" }}>
        Cette page n&rsquo;existe pas ou a été déplacée.
        <br />
        This page doesn&rsquo;t exist or has moved.
      </p>
      <Link
        href="/decouvrir"
        style={{
          marginTop: "0.75rem",
          background: "#feca16",
          color: "#0a0a0a",
          padding: "0.85rem 1.6rem",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Retour à l&rsquo;accueil · Back home
      </Link>
    </main>
  );
}
