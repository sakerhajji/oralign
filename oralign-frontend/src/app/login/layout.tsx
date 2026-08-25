import type { Metadata } from "next";

/**
 * The page itself is a client component, so its metadata (title + the
 * noindex directive) lives on this pass-through layout. Auth surfaces
 * are crawlable (robots.txt must NOT block them, or Google never sees
 * the noindex) but never indexed.
 */
export const metadata: Metadata = {
  // Root template chain appends " · Oralign" — no manual suffix here.
  title: "Connexion praticien",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
