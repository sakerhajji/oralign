import type { Metadata } from "next";
import { legalDocMeta } from "@/lib/legal/legal-content";
import { LegalDocView } from "../_components/legal/legal-doc-view";
import { getLegalCompany } from "../_lib/legal-info";

const meta = legalDocMeta("legal", "fr");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: meta.href },
};

export default async function MentionsLegalesPage() {
  const company = await getLegalCompany();
  return <LegalDocView docKey="legal" company={company} />;
}
