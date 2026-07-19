"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { fetchPractitioners, type PublicPractitioner } from "../_lib/finder";
import { Reveal } from "./shared/reveal";
import { PractitionerList } from "./finder/practitioner-list";
import { PractitionerDetailPanel } from "./finder/practitioner-detail";

type LatLng = [number, number];
type GeoStatus =
  | "idle"
  | "locating"
  | "denied"
  | "unavailable"
  | "granted"
  // Visitor picked their position by clicking the map — the fallback when
  // browser geolocation is denied, unavailable, or blocked by a restrictive
  // Permissions-Policy header. Distance sorting works exactly the same.
  | "manual";

// Leaflet touches `window`, so the map is client-only. A branded skeleton
// holds the layout while the chunk loads.
const PractitionerMap = dynamic(() => import("./finder/practitioner-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[rgba(25,25,25,0.04)]">
      <span className="text-[0.8rem] uppercase tracking-[0.18em] text-[var(--sc-text-mid)]">
        ORALIGN
      </span>
    </div>
  ),
});

/** Union of the current values into the running facet list (sorted, unique). */
function mergeFacet(prev: string[], values: (string | null)[]): string[] {
  const set = new Set(prev);
  for (const v of values) if (v && v.trim()) set.add(v.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function PractitionerFinder() {
  const { lang } = useShowcaseLang();
  const f = dict.finder;

  // Filters
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");

  // Data
  const [practitioners, setPractitioners] = useState<PublicPractitioner[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Facet options accumulate so the dropdowns stay stable across filtering.
  const [facetCities, setFacetCities] = useState<string[]>([]);

  // Geolocation + map focus
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [focus, setFocus] = useState<LatLng | null>(null);

  // Selection (drives the detail panel + the active marker)
  const [selected, setSelected] = useState<PublicPractitioner | null>(null);
  const selectedId = selected?.id ?? null;

  // ── Fetch list (debounced; refetches on filter or location change) ──
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      fetchPractitioners(
        {
          limit: 100,
          search: search.trim() || undefined,
          city: city || undefined,
          lat: userPosition?.[0],
          lng: userPosition?.[1],
        },
        ctrl.signal,
      )
        .then((res) => {
          setPractitioners(res.data);
          setTotal(res.total);
          setLoading(false);
          setFacetCities((prev) => mergeFacet(prev, res.data.map((p) => p.city)));
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          setError(true);
          setLoading(false);
          void err;
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [search, city, userPosition, reloadKey]);

  // ── Geolocation ──
  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setUserPosition(p);
        setFocus(p);
        setGeoStatus("granted");
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  // If permission was already granted in a previous visit, locate silently —
  // no surprise prompt on first load otherwise.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") requestLocation();
      })
      .catch(() => {});
  }, [requestLocation]);

  // ── Selection ──
  const handleSelect = useCallback((p: PublicPractitioner) => {
    setSelected(p);
    if (typeof p.latitude === "number" && typeof p.longitude === "number") {
      setFocus([p.latitude, p.longitude]);
    }
  }, []);

  const handleMapSelect = useCallback(
    (id: string) => {
      const p = practitioners.find((x) => x.id === id);
      if (p) handleSelect(p);
    },
    [practitioners, handleSelect],
  );

  // Manual position fallback — clicking the map sets "where I am". Works
  // even when the browser refuses geolocation, and lets a visitor search
  // around any other point (their office, a relative's town, …).
  const handlePickPosition = useCallback((lat: number, lng: number) => {
    const p: LatLng = [lat, lng];
    setUserPosition(p);
    setFocus(p);
    setGeoStatus("manual");
  }, []);

  const closeDetail = useCallback(() => setSelected(null), []);

  const hasActiveFilters = Boolean(search || city);
  const clearFilters = () => {
    setSearch("");
    setCity("");
  };

  const resultsLabel = useMemo(
    () => f.resultsCount[lang].replace("{n}", String(total)),
    [f.resultsCount, lang, total],
  );

  return (
    <section
      data-section-tone="light"
      className="bg-[var(--sc-white)] px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* ── Heading ── */}
        <Reveal>
          <div className="mb-6 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
            <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
            <span>{dict.brand.name[lang]}</span>
          </div>
          <h1 className="sc-serif text-[clamp(2.1rem,4.6vw,3.4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
            {f.title[lang]}
          </h1>
          <p className="mt-4 max-w-[640px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
            {f.subtitle[lang]}
          </p>
        </Reveal>

        {/* ── Filter bar ── */}
        <Reveal delay>
          <div className="mt-10 flex flex-col gap-3 border border-[rgba(25,25,25,0.1)] bg-[rgba(25,25,25,0.015)] p-4 sm:p-5 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--sc-text-mid)]">
                {f.searchLabel[lang]}
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={f.searchPlaceholder[lang]}
                className="w-full border border-[rgba(25,25,25,0.18)] bg-[var(--sc-white)] px-3 py-2.5 text-[0.9rem] text-[var(--sc-black)] outline-none focus:border-[var(--sc-black)]"
              />
            </label>

            <label className="lg:w-44">
              <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--sc-text-mid)]">
                {f.cityLabel[lang]}
              </span>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-[rgba(25,25,25,0.18)] bg-[var(--sc-white)] px-3 py-2.5 text-[0.9rem] text-[var(--sc-black)] outline-none focus:border-[var(--sc-black)]"
              >
                <option value="">{f.cityPlaceholder[lang]}</option>
                {facetCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={requestLocation}
              disabled={geoStatus === "locating"}
              className="sc-serif inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--sc-black)] px-4 py-2.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)] disabled:opacity-60"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {geoStatus === "locating" ? f.locating[lang] : f.useMyLocation[lang]}
            </button>
          </div>
        </Reveal>

        {/* ── Status line ── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem] text-[var(--sc-text-mid)]">
          {!loading && !error && <span>{resultsLabel}</span>}
          {userPosition && (geoStatus === "granted" || geoStatus === "manual") && (
            <span className="text-[var(--sc-sun-deep)]">· {f.sortedByDistance[lang]}</span>
          )}
          {geoStatus === "denied" && <span>· {f.geoDenied[lang]}</span>}
          {geoStatus === "unavailable" && <span>· {f.geoUnavailable[lang]}</span>}
          {/* No position yet (never asked, refused, or blocked) → tell the
              visitor the map itself is the fallback. */}
          {!userPosition && geoStatus !== "locating" && (
            <span className="text-[var(--sc-sun-deep)]">
              · {f.pickOnMapHint[lang]}
            </span>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="underline decoration-[var(--sc-sun)] underline-offset-2 hover:text-[var(--sc-black)]"
            >
              {f.clearFilters[lang]}
            </button>
          )}
        </div>

        {/* ── Map + list ── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
          {/* List — below the map on mobile, left column on desktop */}
          <div className="order-2 lg:order-1 lg:max-h-[660px] lg:overflow-y-auto lg:pr-1">
            <PractitionerList
              practitioners={practitioners}
              loading={loading}
              error={error}
              selectedId={selectedId}
              onSelect={handleSelect}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>

          {/* Map — on top on mobile, right column (sticky) on desktop */}
          <div className="order-1 h-[380px] overflow-hidden border border-[rgba(25,25,25,0.12)] sm:h-[440px] lg:order-2 lg:sticky lg:top-24 lg:h-[660px]">
            <PractitionerMap
              practitioners={practitioners}
              userPosition={userPosition}
              selectedId={selectedId}
              focus={focus}
              userLabel={f.youAreHere[lang]}
              onSelect={handleMapSelect}
              onPickPosition={handlePickPosition}
            />
          </div>
        </div>
      </div>

      {/* ── Detail + booking panel ── */}
      {selected && (
        // key by id → a fresh mount per practitioner so the booking form
        // (and its success screen) never carries over from a previous selection.
        <PractitionerDetailPanel
          key={selected.id}
          summary={selected}
          onClose={closeDetail}
        />
      )}
    </section>
  );
}
