import type { Metadata } from "next";

/** Client page → metadata on the pass-through layout. Never indexed. */
export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
