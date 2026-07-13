import { dict } from "../../_lib/i18n/dict";
import type { Lang } from "../../_lib/finder";

/**
 * "à 2.3 km" / "2.3 km away" — returns null when no distance is known (the
 * list was fetched without geolocation, so the backend omitted `distanceKm`).
 */
export function formatDistanceLabel(km: number | undefined, lang: Lang): string | null {
  if (typeof km !== "number" || !Number.isFinite(km)) return null;
  const n = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return dict.finder.distanceKm[lang].replace("{n}", n);
}
