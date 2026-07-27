"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import {
  fetchAvailability,
  fetchPractitioner,
  mediaUrl,
  type AvailabilityResponse,
  type DayOfWeek,
  type PractitionerDetail as Detail,
  type PublicPractitioner,
  type WorkingHour,
} from "../../_lib/finder";
import { BookingForm } from "./booking-form";
import { formatDistanceLabel } from "./distance";

const DAY_ORDER: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

interface Props {
  /** List summary — shown instantly while the full detail loads. */
  summary: PublicPractitioner;
  onClose: () => void;
}

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
  const [avatarOk, setAvatarOk] = useState(true);

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

  const detailForCurrent = detail?.id === id ? detail : null;
  const detailError = detailErrorId === id;
  const availability =
    availabilityState.key === availabilityKey ? availabilityState.data : null;
  const availLoading = availabilityState.key !== availabilityKey;
  const availError =
    availabilityState.key === availabilityKey && availabilityState.error;
  const view = detailForCurrent ?? summary;
  const avatar = mediaUrl(view.avatarUrl);
  const initials = view.practitionerName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const hoursByDay = new Map<DayOfWeek, WorkingHour>();
  detailForCurrent?.workingHours?.forEach((w) =>
    hoursByDay.set(w.dayOfWeek, w),
  );
  // Distance is only computed by the list endpoint (needs lat/lng); keep it
  // from the summary since the detail endpoint never returns it.
  const distance = formatDistanceLabel(summary.distanceKm, lang);

  return (
    <div
      className="fixed inset-0 z-[1000] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={view.practitionerName}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={f.close[lang]}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(25,25,25,0.5)] backdrop-blur-[1px]"
      />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto bg-[var(--sc-white)] text-[var(--sc-black)] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sc-sun)] text-[1rem] font-bold text-[var(--sc-black)]">
              {avatar && avatarOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                initials || "•"
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[0.58rem] uppercase tracking-[0.36em] text-[var(--sc-sun-deep)]">
                {dict.brand.name[lang]}
              </p>
              <h2 className="sc-serif mt-1 text-[1.5rem] font-normal leading-tight tracking-[-0.01em]">
                {view.practitionerName}
              </h2>
              <p className="mt-0.5 text-[0.95rem] text-[var(--sc-text-mid)]">{view.clinicName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={f.close[lang]}
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--sc-black)] transition-colors hover:bg-[rgba(25,25,25,0.06)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-6">
          {detailError && (
            <p className="mb-5 border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-red-700">
              {f.detailError[lang]}
            </p>
          )}

          {/* Key facts */}
          <dl className="space-y-4">
            {(view.clinicAddress || view.city) && (
              <FactRow label={f.address[lang]}>
                {[view.clinicAddress, view.city, view.country].filter(Boolean).join(", ")}
                {distance && (
                  <span className="ml-2 text-[0.82rem] text-[var(--sc-sun-deep)]">· {distance}</span>
                )}
              </FactRow>
            )}

            <FactRow label={f.phone[lang]}>
              {view.clinicPhone ? (
                <a
                  href={`tel:${view.clinicPhone.replace(/\s/g, "")}`}
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

          {/* Weekly hours */}
          <section className="mt-8">
            <h3 className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
              {f.workingHours[lang]}
            </h3>
            <dl className="mt-3 divide-y divide-[rgba(25,25,25,0.08)] border border-[rgba(25,25,25,0.1)]">
              {DAY_ORDER.map((day) => {
                const w = hoursByDay.get(day);
                const closed = !w || w.isClosed;
                return (
                  <div key={day} className="flex items-center justify-between px-4 py-2.5">
                    <dt className="text-[0.85rem] text-[var(--sc-black)]">{f.days[day][lang]}</dt>
                    <dd
                      className={
                        closed
                          ? "text-[0.82rem] italic text-[rgba(25,25,25,0.4)]"
                          : "text-[0.85rem] font-medium tabular-nums text-[var(--sc-black)]"
                      }
                    >
                      {closed ? f.closed[lang] : `${w!.openTime} – ${w!.closeTime}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* Booking */}
          <section className="mt-8">
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
