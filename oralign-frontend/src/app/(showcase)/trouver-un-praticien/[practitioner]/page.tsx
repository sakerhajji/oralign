import type { Metadata } from "next";
import { PractitionerPage, practitionerPageMetadata } from "../../_lib/practitioner-page";

/** Re-read the directory hourly: a practice edits its hours, joins or leaves. */
export const revalidate = 3600;

/**
 * Nothing prebuilt (the API may be unreachable at build time); an empty
 * list is what makes Next cache each profile on first visit (ISR) instead
 * of rendering it on every request.
 */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ practitioner: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { practitioner } = await params;
  return practitionerPageMetadata(practitioner, "fr");
}

export default async function PractitionerProfilePage({ params }: { params: Params }) {
  const { practitioner } = await params;
  return <PractitionerPage slug={practitioner} lang="fr" />;
}
