import type { Metadata } from "next";

/**
 * Client page → metadata on the pass-through layout. noindex: the B2B
 * acquisition page for search is /praticiens; the raw signup form has
 * no standalone search value and would only dilute it.
 */
export const metadata: Metadata = {
  title: "Créer un compte praticien",
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
