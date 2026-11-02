"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, Navigation, Phone, X } from "lucide-react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import {
  dayOfWeekOf,
  fetchAvailability,
  fetchPractitioner,
  type AvailabilityResponse,
  type DayOfWeek,
  type PractitionerDetail as Detail,
  type PublicPractitioner,
  type WorkingHour,
} from "../../_lib/finder";
import { BookingForm } from "./booking-form";
import { formatDistanceLabel } from "./distance";
import { Avatar } from "./practitioner-list";

const DAY_ORDER: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--sc-black)] px-3 text-[0.84rem] font-medium text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]";

interface Props {
  /** List summary — shown instantly while the full detail loads. */
  summary: PublicPractitioner;
  onClose: () => void;
}

/**
 * The practice sheet: facts, hours and the booking form.
 *
 * On a phone it rises from the bottom and fills the screen, with "back to
 * the list" at the top-left where a thumb reaches it, the two things a
 * visitor on the move wants first — call, directions — as buttons under the
 * name, today's hours (the week folds away), and a bar pinned to the bottom
 * that leads to the booking form until the form itself is on screen. On a
 * desktop it is the side panel it has always been.
 */
export function PractitionerDetailPanel({ summary, onClose }: Props) {
  const { lang } = useShowcaseLang();
  const f = dict.finder;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErrorId, setDetailErrorId] = useState<string | null>(null);

  const [availabilityRequest, setAvailabilityRequest] = useState(0);
  const [availabilityState, setAvailabilityState] = useState<{
    key: string | null;
    data: AvailabilityResponse | null;
    error: boolean;
  }>({ key: null, data: null, error: false });
  const [hoursOpen, setHoursOpen] = useState(false);
  /** The booking section is on screen: the pinned bar steps aside. */
  const [bookingInView, setBookingInView] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bookingRef = useRef<HTMLElement>(null);

  const id = summary.id;
  const availabilityKey = `${id}:${availabilityRequest}`;

  // Fetch the full profile (adds workingHours).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchPractitioner(id, ctrl.signal)
      .then((res) => {
        setDetail(res);
        setDetailErrorId(null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setDetailErrorId(id);
        void err;
      });
    return () => ctrl.abort();
  }, [id]);

  const loadAvailability = useCallback(() => {
    setAvailabilityRequest((current) => current + 1);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAvailability(id, {}, ctrl.signal)
      .then((res) => {
        setAvailabilityState({ key: availabilityKey, data: res, error: false });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setAvailabilityState({ key: availabilityKey, data: null, error: true });
        void err;
      });
    return () => ctrl.abort();
  }, [availabilityKey, id]);

  // Close on Escape + lock background scroll while the panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Hide the pinned "book" bar while any of the booking section is on screen.
  useEffect(() => {
    const root = panelRef.current;
    const target = bookingRef.current;
    if (!root || !target) return;
    // "On screen" = reaching the upper 60 % of the panel: a heading at the
    // very bottom edge is not a form the visitor can use yet.
    const observer = new IntersectionObserver(
      ([entry]) => setBookingInView(Boolean(entry?.isIntersecting)),
      { root, rootMargin: "0px 0px -40% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const scrollToBooking = () => {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bookingRef.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  };

  const detailForCurrent = detail?.id === id ? detail : null;
  const detailError = detailErrorId === id;
  const availability =
    availabilityState.key === availabilityKey ? availabilityState.data : null;
  const availLoading = availabilityState.key !== availabilityKey;
  const availError =
    availabilityState.key === availabilityKey && availabilityState.error;
  const view = detailForCurrent ?? summary;
  const hoursByDay = new Map<DayOfWeek, WorkingHour>();
  detailForCurrent?.workingHours?.forEach((w) =>
    hoursByDay.set(w.dayOfWeek, w),
  );
  const hoursOf = (day: DayOfWeek) => {
    const w = hoursByDay.get(day);
    return !w || w.isClosed ? null : `${w.openTime} – ${w.closeTime}`;
  };
  const today = dayOfWeekOf(new Date());
  // Distance is only computed by the list endpoint (needs lat/lng); keep it
  // from the summary since the detail endpoint never returns it.
  const distance = formatDistanceLabel(summary.distanceKm, lang);
  // City and country only when the address line does not already end with them.
  const address = [view.clinicAddress, view.city, view.country]
    .filter((part): part is string => Boolean(part))
    .filter((part, i, parts) => i === 0 || !parts[0].toLowerCase().includes(part.toLowerCase()))
    .join(", ");
  const phone = view.clinicPhone?.replace(/\s/g, "") || null;
  // Directions open in the visitor's maps app: by coordinates when the
  // practice has them, by its address otherwise.
  const destination =
    typeof view.latitude === "number" && typeof view.longitude === "number"
      ? `${view.latitude},${view.longitude}`
      : address;
  const directions = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={view.practitionerName}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={f.close[lang]}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(25,25,25,0.5)] backdrop-blur-[1px] animate-in fade-in duration-200 motion-reduce:animate-none"
      />

      {/* Panel: rises on a phone, slides in from the side on a desktop. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-y-auto overscroll-y-contain bg-[var(--sc-white)] text-[var(--sc-black)] shadow-2xl outline-none animate-in duration-300 max-sm:slide-in-from-bottom sm:max-w-[560px] sm:slide-in-from-right motion-reduce:animate-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)]">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center gap-1 px-4 text-[0.84rem] font-medium text-[var(--sc-text-mid)] transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)] sm:hidden"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            {f.backToList[lang]}
          </button>
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-1 sm:px-6 sm:py-5">
            <div className="flex min-w-0 items-start gap-3.5">
              <Avatar practitioner={view} className="h-14 w-14 text-[1rem]" />
              <div className="min-w-0">
                <p className="text-[0.58rem] uppercase tracking-[0.36em] text-[var(--sc-sun-deep)]">
                  {dict.brand.name[lang]}
                </p>
                <h2 className="sc-serif mt-1 text-[1.4rem] font-normal leading-tight tracking-[-0.01em] sm:text-[1.5rem]">
                  {view.practitionerName}
                </h2>
                <p className="mt-0.5 text-[0.95rem] text-[var(--sc-text-mid)]">
                  {view.clinicName}
                  {distance && <span className="text-[var(--sc-sun-deep)]"> · {distance}</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={f.close[lang]}
              className="-mr-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--sc-black)] transition-colors hover:bg-[rgba(25,25,25,0.06)] focus-visible:outline-2 focus-visible:outline-[var(--sc-sun)] sm:flex"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 py-5 sm:px-6 sm:py-6">
          {detailError && (
            <p className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-red-700">
              {f.detailError[lang]}
            </p>
          )}

          {/* Quick actions */}
          {(phone || directions) && (
            <div className={`grid gap-2 ${phone && directions ? "grid-cols-2" : "grid-cols-1"}`}>
              {phone && (
                <a href={`tel:${phone}`} className={ACTION}>
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {f.call[lang]}
                </a>
              )}
              {directions && (
                <a href={directions} target="_blank" rel="noopener noreferrer" className={ACTION}>
                  <Navigation aria-hidden="true" className="h-4 w-4" />
                  {f.directions[lang]}
                </a>
              )}
            </div>
          )}

          {/* Key facts */}
          <dl className="mt-6 space-y-4">
            {address && <FactRow label={f.address[lang]}>{address}</FactRow>}

            <FactRow label={f.phone[lang]}>
              {view.clinicPhone ? (
                <a
                  href={`tel:${phone}`}
                  className="text-[var(--sc-sun-deep)] underline decoration-[var(--sc-sun)] underline-offset-2 hover:text-[var(--sc-black)]"
                >
                  {view.clinicPhone}
                </a>
              ) : (
                <span className="italic text-[rgba(25,25,25,0.4)]">{f.noPhone[lang]}</span>
              )}
            </FactRow>

            {view.description && <FactRow label={f.about[lang]}>{view.description}</FactRow>}
          </dl>

          {/* Weekly hours: today on a phone, with the week behind a toggle;
              the full week on a desktop. */}
          <section className="mt-8">
            <h3 className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
              {f.workingHours[lang]}
            </h3>
            <div className="mt-3 border border-[rgba(25,25,25,0.1)] sm:hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[0.88rem] font-medium">{f.today[lang]}</span>
                {detailForCurrent ? (
                  <span
                    className={
                      hoursOf(today)
                        ? "text-[0.88rem] font-medium tabular-nums"
                        : "text-[0.84rem] italic text-[rgba(25,25,25,0.4)]"
                    }
                  >
                    {hoursOf(today) ?? f.closed[lang]}
                  </span>
                ) : (
                  <span className="h-3.5 w-24 animate-pulse bg-[rgba(25,25,25,0.06)]" aria-hidden="true" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setHoursOpen((open) => !open)}
                aria-expanded={hoursOpen}
                aria-controls="finder-hours-week"
                className="flex w-full items-center justify-between border-t border-[rgba(25,25,25,0.08)] px-4 py-3 text-[0.82rem] font-medium text-[var(--sc-text-mid)] transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
              >
                {hoursOpen ? f.hideHours[lang] : f.allHours[lang]}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${hoursOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            <dl
              id="finder-hours-week"
              className={`${hoursOpen ? "border-t-0" : "hidden"} divide-y divide-[rgba(25,25,25,0.08)] border border-[rgba(25,25,25,0.1)] sm:mt-3 sm:block sm:border-t`}
            >
              {DAY_ORDER.map((day) => {
                const open = hoursOf(day);
                const isToday = day === today;
                return (
                  <div key={day} className={`flex items-center justify-between px-4 py-2.5 ${isToday ? "bg-[var(--sc-sun-3)]" : ""}`}>
                    <dt className={`text-[0.85rem] ${isToday ? "font-medium" : ""}`}>{f.days[day][lang]}</dt>
                    <dd
                      className={
                        open
                          ? "text-[0.85rem] font-medium tabular-nums"
                          : "text-[0.82rem] italic text-[rgba(25,25,25,0.4)]"
                      }
                    >
                      {open ?? f.closed[lang]}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* Booking */}
          <section ref={bookingRef} className="mt-8 scroll-mt-4">
            <h3 className="sc-serif text-[1.2rem] font-medium tracking-[-0.01em]">
              {f.book[lang]}
            </h3>
            <BookingForm
              dentistProfileId={id}
              practitionerName={view.practitionerName}
              availability={availability}
              loading={availLoading}
              error={availError}
              onRefresh={loadAvailability}
            />
          </section>
        </div>

        {/* Phone: the way to the booking form, pinned until the form is on screen. */}
        {!bookingInView && (
          <div className="sticky bottom-0 z-10 border-t border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
            <button
              type="button"
              onClick={scrollToBooking}
              className="sc-serif inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--sc-black)] px-6 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] transition-colors hover:bg-[rgba(25,25,25,0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
              {f.book[lang]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(90px,0.35fr)_1fr] gap-3">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--sc-text-mid)]">
        {label}
      </dt>
      <dd className="text-[0.92rem] leading-7 text-[var(--sc-black)]">{children}</dd>
    </div>
  );
}
