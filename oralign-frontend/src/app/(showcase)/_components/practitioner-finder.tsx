"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, LocateFixed, Search } from "lucide-react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { fetchPractitioners, type ListResponse, type PublicPractitioner } from "../_lib/finder";
import { Reveal } from "./shared/reveal";
import { Avatar, PractitionerList } from "./finder/practitioner-list";
import { PractitionerDetailPanel } from "./finder/practitioner-detail";
import { formatDistanceLabel } from "./finder/distance";

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

/**
 * Below `lg` the finder shows ONE of list and map, chosen by a toggle: a
 * map in the middle of a phone page swallows every scroll gesture over it,
 * and a list under a map is what nobody scrolls to. Desktop shows both.
 */
type View = "list" | "map";
const DESKTOP_MEDIA = "(min-width: 1024px)";

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

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_MEDIA);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** true on desktop, false below `lg`, null on the server and during hydration. */
function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_MEDIA).matches,
    () => null,
  );
}

const CHIP =
  "inline-flex h-10 shrink-0 items-center gap-2 border px-3.5 text-[0.84rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]";

/**
 * `initial` is the directory as the server read it. Seeding the state with it
 * puts every practitioner in the server-rendered HTML — without it, crawlers
 * (which don't wait for this component's fetch) indexed an empty finder.
 */
export function PractitionerFinder({ initial }: { initial?: ListResponse } = {}) {
  const { lang } = useShowcaseLang();
  const f = dict.finder;
  const isDesktop = useIsDesktop();

  // Filters
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [view, setView] = useState<View>("list");

  // Data
  const [practitioners, setPractitioners] = useState<PublicPractitioner[]>(initial?.data ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [loading, setLoading] = useState(!initial?.data.length);
  // The server already delivered the unfiltered list; refetching it on mount
  // would only flash the loading state over identical data.
  const skipFirstFetch = useRef(Boolean(initial?.data.length));
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Facet options accumulate so the dropdowns stay stable across filtering.
  const [facetCities, setFacetCities] = useState<string[]>(() =>
    mergeFacet([], (initial?.data ?? []).map((p) => p.city)),
  );

  // Geolocation + map focus
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [focus, setFocus] = useState<LatLng | null>(null);

  // Selection drives the active marker and the map's card; `detailOpen`
  // the sheet. On a phone's map a pin shows its card first — the sheet
  // would hide the map the visitor is reading — and the card opens the sheet.
  const [selected, setSelected] = useState<PublicPractitioner | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedId = selected?.id ?? null;

  // ── Fetch list (debounced; refetches on filter or location change) ──
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
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
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
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
  const focusOn = useCallback((p: PublicPractitioner) => {
    setSelected(p);
    if (typeof p.latitude === "number" && typeof p.longitude === "number") {
      setFocus([p.latitude, p.longitude]);
    }
  }, []);

  /** From the list, or the map's card: open the sheet. */
  const handleSelect = useCallback(
    (p: PublicPractitioner) => {
      focusOn(p);
      setDetailOpen(true);
    },
    [focusOn],
  );

  const handleMapSelect = useCallback(
    (id: string) => {
      const p = practitioners.find((x) => x.id === id);
      if (!p) return;
      if (isDesktop) handleSelect(p);
      else focusOn(p);
    },
    [practitioners, isDesktop, handleSelect, focusOn],
  );

  // Manual position fallback — clicking the map sets "where I am". Works
  // even when the browser refuses geolocation, and lets a visitor search
  // around any other point (their office, a relative's town, …).
  const handlePickPosition = useCallback((lat: number, lng: number) => {
    setUserPosition([lat, lng]);
    setGeoStatus("manual");
  }, []);

  // With a position and nothing selected, the map frames the visitor and
  // the three nearest practices (the list arrives sorted by distance) —
  // not the visitor alone at street zoom, where a town without a practice
  // shows an empty map, nor the whole country.
  const fit = useMemo<LatLng[] | null>(() => {
    if (!userPosition || selected) return null;
    const nearest = practitioners
      .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
      .slice(0, 3)
      .map((p): LatLng => [p.latitude as number, p.longitude as number]);
    return [userPosition, ...nearest];
  }, [userPosition, selected, practitioners]);

  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || practitioners.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("p");
    const match = wanted ? practitioners.find((x) => x.id === wanted) : undefined;
    if (!match) return;
    // Deferred: opening the panel is a state change, kept out of the effect body.
    const timer = setTimeout(() => {
      deepLinked.current = true;
      handleSelect(match);
    }, 0);
    return () => clearTimeout(timer);
  }, [practitioners, handleSelect]);

  const closeDetail = useCallback(() => setDetailOpen(false), []);

  const located = userPosition !== null && (geoStatus === "granted" || geoStatus === "manual");
  // Desktop always shows the map; below `lg` only the map view mounts it
  // (a hidden Leaflet map measures 0×0 and comes back blank).
  const showMap = isDesktop === true || view === "map";
  const phoneMap = isDesktop === false && view === "map";

  // Phone: bring the map under the toggle bar when it is chosen, so the
  // whole map — and the card a pin opens at its foot — is on screen.
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!phoneMap) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }, [phoneMap]);

  // The sheet is a place of its own on a phone: opening it adds a history
  // entry, so the Back button (or gesture) closes it instead of leaving the
  // page. Closing it any other way removes that entry again.
  useEffect(() => {
    if (!detailOpen) return;
    window.history.pushState({ ...window.history.state, finderSheet: true }, "");
    const onPop = () => setDetailOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.finderSheet) window.history.back();
    };
  }, [detailOpen]);

  const hasActiveFilters = Boolean(search || city);
  const clearFilters = () => {
    setSearch("");
    setCity("");
  };

  const resultsLabel = useMemo(
    () => f.resultsCount[lang].replace("{n}", String(total)),
    [f.resultsCount, lang, total],
  );

  const selectedDistance = selected ? formatDistanceLabel(selected.distanceKm, lang) : null;

  return (
    <section
      data-section-tone="light"
      className="bg-[var(--sc-white)] px-5 py-12 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* ── Heading ── */}
        <Reveal>
          <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)] sm:mb-6">
            <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
            <span>{dict.brand.name[lang]}</span>
          </div>
          <h1 className="sc-serif text-[clamp(2rem,4.6vw,3.4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
            {f.title[lang]}
          </h1>
          <p className="mt-3 max-w-[640px] text-[0.95rem] leading-7 text-[var(--sc-text-mid)] sm:mt-4 sm:text-[0.98rem] sm:leading-8">
            {f.subtitle[lang]}
          </p>
        </Reveal>

        {/* ── Search + chips ── */}
        <Reveal delay>
          <div className="mt-7 flex flex-col gap-3 sm:mt-10 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">{f.searchLabel[lang]}</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(25,25,25,0.45)]"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={f.searchPlaceholder[lang]}
                autoComplete="off"
                enterKeyHint="search"
                // 16 px on phones: iOS zooms into any field set smaller.
                className="h-12 w-full appearance-none border border-[rgba(25,25,25,0.18)] bg-[var(--sc-white)] ps-10 pe-3 text-[16px] text-[var(--sc-black)] outline-none transition-colors placeholder:text-[rgba(25,25,25,0.4)] focus:border-[var(--sc-black)] sm:text-[0.92rem] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
              />
            </label>

            {/* The chips scroll sideways on a phone rather than wrap. */}
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={requestLocation}
                disabled={geoStatus === "locating"}
                aria-pressed={located}
                className={[
                  CHIP,
                  located
                    ? "border-[var(--sc-black)] bg-[var(--sc-black)] text-[var(--sc-white)]"
                    : "border-[rgba(25,25,25,0.18)] text-[var(--sc-black)] hover:border-[var(--sc-black)] disabled:opacity-60",
                ].join(" ")}
              >
                <LocateFixed aria-hidden="true" className={`h-4 w-4 ${geoStatus === "locating" ? "animate-pulse" : ""}`} />
                {geoStatus === "locating" ? f.locating[lang] : located ? f.nearYou[lang] : f.nearMe[lang]}
              </button>

              <label className={`${CHIP} relative cursor-pointer ${city ? "border-[var(--sc-black)]" : "border-[rgba(25,25,25,0.18)] hover:border-[var(--sc-black)]"}`}>
                <span className="sr-only">{f.cityLabel[lang]}</span>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
                >
                  <option value="">{f.cityPlaceholder[lang]}</option>
                  {facetCities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">{city || f.cityPlaceholder[lang]}</span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-[rgba(25,25,25,0.5)]" />
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`${CHIP} border-transparent text-[var(--sc-text-mid)] underline decoration-[var(--sc-sun)] underline-offset-4 hover:text-[var(--sc-black)]`}
                >
                  {f.clearFilters[lang]}
                </button>
              )}
            </div>
          </div>
        </Reveal>

        {/* ── Status + view toggle: stays under the header below `lg`, so
            the toggle is at hand while the map fills the screen. ── */}
        <div className="sticky top-16 z-10 -mx-5 mt-5 flex items-center justify-between gap-4 bg-[var(--sc-white)] px-5 py-2.5 sm:top-[72px] sm:mx-0 sm:mt-6 sm:px-0 lg:static lg:py-0">
          <p className="min-w-0 text-[0.84rem] leading-6 text-[var(--sc-text-mid)]">
            {!loading && !error && <span>{resultsLabel}</span>}
            {located && <span className="text-[var(--sc-sun-deep)]"> · {f.sortedByDistance[lang]}</span>}
            {geoStatus === "denied" && <span> · {f.geoDenied[lang]}</span>}
            {geoStatus === "unavailable" && <span> · {f.geoUnavailable[lang]}</span>}
            {/* No position yet (never asked, refused, or blocked): the map
                is the fallback. The phone says so on the map itself. */}
            {!userPosition && geoStatus !== "locating" && (
              <span className="hidden text-[var(--sc-sun-deep)] lg:inline"> · {f.pickOnMapHint[lang]}</span>
            )}
          </p>

          <div
            role="group"
            aria-label={`${f.showList[lang]} / ${f.showMap[lang]}`}
            className="flex shrink-0 border border-[rgba(25,25,25,0.18)] p-0.5 lg:hidden"
          >
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={[
                  "min-h-9 px-3.5 text-[0.8rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--sc-sun)]",
                  view === v ? "bg-[var(--sc-black)] text-[var(--sc-white)]" : "text-[var(--sc-black)]",
                ].join(" ")}
              >
                {v === "list" ? f.showList[lang] : f.showMap[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Map + list ── */}
        <div className="mt-4 grid gap-6 sm:mt-5 lg:grid-cols-[minmax(0,400px)_1fr]">
          {/* The list stays in the DOM in map view (it is the crawlable
              directory); only its display changes. */}
          <div className={`${view === "map" ? "hidden lg:block" : ""} lg:max-h-[660px] lg:overflow-y-auto lg:pr-1`}>
            <PractitionerList
              practitioners={practitioners}
              loading={loading}
              error={error}
              selectedId={selectedId}
              onSelect={handleSelect}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>

          {showMap && (
            // `isolate`: Leaflet's own z-indexes stay inside the map, under
            // the sticky toggle bar and the sheet.
            <div
              ref={mapRef}
              className="relative isolate -mx-5 h-[min(62svh,560px)] min-h-[360px] scroll-mt-32 overflow-hidden border-y border-[rgba(25,25,25,0.12)] sm:mx-0 sm:h-[440px] sm:scroll-mt-36 sm:border lg:sticky lg:top-24 lg:h-[660px]"
            >
              <PractitionerMap
                practitioners={practitioners}
                userPosition={userPosition}
                selectedId={selectedId}
                focus={focus}
                fit={fit}
                userLabel={f.youAreHere[lang]}
                onSelect={handleMapSelect}
                onPickPosition={handlePickPosition}
                zoomControl={isDesktop !== false}
                // The card under the map says who the pin is.
                popups={isDesktop !== false}
              />

              {phoneMap && (
                <>
                  {!userPosition && geoStatus !== "locating" && (
                    <p className="pointer-events-none absolute inset-x-3 top-3 z-[1100] bg-[rgba(25,25,25,0.72)] px-3 py-2 text-center text-[0.78rem] text-[var(--sc-white)] backdrop-blur-sm">
                      {f.tapOnMapHint[lang]}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={requestLocation}
                    disabled={geoStatus === "locating"}
                    aria-label={f.useMyLocation[lang]}
                    className={`absolute end-3 z-[1100] flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(25,25,25,0.12)] bg-[var(--sc-white)] text-[var(--sc-black)] shadow-[0_6px_18px_rgba(0,0,0,0.18)] transition-colors hover:bg-white disabled:opacity-60 ${selected ? "bottom-[6.5rem]" : "bottom-3"}`}
                  >
                    <LocateFixed aria-hidden="true" className={`h-5 w-5 ${geoStatus === "locating" ? "animate-pulse" : ""}`} />
                  </button>
                  {selected && (
                    // The pin's card: who it is, and the way into the sheet.
                    <div className="absolute inset-x-3 bottom-3 z-[1100] flex items-center gap-3 border border-[rgba(25,25,25,0.12)] bg-[var(--sc-white)] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.22)] animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
                      <Avatar practitioner={selected} size={44} className="text-[0.8rem]" />
                      <div className="min-w-0 flex-1">
                        <p className="sc-serif truncate text-[1rem] font-medium leading-tight">{selected.practitionerName}</p>
                        <p className="truncate text-[0.82rem] text-[var(--sc-text-mid)]">
                          {[selected.clinicName, selected.city].filter(Boolean).join(" · ")}
                          {selectedDistance && <span className="text-[var(--sc-sun-deep)]"> · {selectedDistance}</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelect(selected)}
                        className="sc-serif inline-flex min-h-10 shrink-0 items-center gap-1 bg-[var(--sc-black)] ps-3.5 pe-2.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-white)] transition-colors hover:bg-[rgba(25,25,25,0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
                      >
                        {f.viewDetails[lang]}
                        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail + booking sheet ── */}
      {detailOpen && selected && (
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
