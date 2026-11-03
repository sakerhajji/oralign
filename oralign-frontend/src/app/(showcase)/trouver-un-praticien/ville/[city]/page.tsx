import type { Metadata } from "next";
import { CityPage, cityPageMetadata, cityStaticParams } from "../../../_lib/city-page";

/** Re-read the directory hourly: a practice joins, leaves or moves. */
export const revalidate = 3600;

/**
 * Every city with a listed practitioner is prebuilt; the read fails soft
 * to none when the API is unreachable at build time, and a city first
 * visited later is rendered on demand and cached (ISR).
 */
export function generateStaticParams() {
  return cityStaticParams();
}

type Params = Promise<{ city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city } = await params;
  return cityPageMetadata(city, "fr");
}

export default async function CityLandingPage({ params }: { params: Params }) {
  const { city } = await params;
  return <CityPage city={city} lang="fr" />;
}
