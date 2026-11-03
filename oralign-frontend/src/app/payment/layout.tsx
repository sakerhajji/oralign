import type { Metadata } from "next";

/**
 * The ClicToPay return and failure pages are client components reached
 * with a payment id in the URL. They are transactional, say nothing
 * about the product, and must never appear in search results — the
 * same pass-through layout the auth pages use, so the noindex ships in
 * the server HTML. Crawlable (robots.txt blocks /payment/ as well: a
 * URL that was never worth fetching, unlike /login).
 */
export const metadata: Metadata = {
  title: "Paiement",
  robots: { index: false, follow: false },
};

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
