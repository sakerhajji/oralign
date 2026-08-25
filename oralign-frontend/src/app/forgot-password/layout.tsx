import type { Metadata } from "next";

/** Client page → metadata on the pass-through layout. Never indexed. */
export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
