"use client";

import { useMemo, useState, type FormEvent } from "react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { createAppointment, type AvailabilityResponse } from "../../_lib/finder";
import { formatDateTime, formatTime, localeOf } from "./format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

/** Morning (< 12h), afternoon (12–17h), evening (≥ 17h). */
type Period = "morning" | "afternoon" | "evening";
const PERIOD_ORDER: Period[] = ["morning", "afternoon", "evening"];
function periodOf(iso: string): Period {
  const h = new Date(iso).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

interface Props {
  dentistProfileId: string;
  practitionerName: string;
  availability: AvailabilityResponse | null;
  loading: boolean;
  error: boolean;
  /** Ask the parent to re-fetch availability (after a 409 race). */
  onRefresh: () => void;
}

type Errors = Partial<Record<"slot" | "name" | "email" | "phone", string>>;

export function BookingForm({
  dentistProfileId,
  practitionerName,
  availability,
  loading,
  error,
  onRefresh,
}: Props) {
  const { lang } = useShowcaseLang();
  const f = dict.finder;

  const [slot, setSlot] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Days that actually have free slots.
  const days = useMemo(
    () => (availability?.days ?? []).filter((d) => d.slots.length > 0),
    [availability],
  );
  const hasSlots = days.length > 0;

  // Active day = the one whose times are shown. Falls back to the first
  // available day so a stale selection (after a refetch) can't blank the grid.
  const activeDay = days.find((d) => d.date === activeDate) ?? days[0] ?? null;

  // The active day's slots bucketed by time of day (only non-empty buckets).
  const periods = useMemo(() => {
    const buckets: Record<Period, string[]> = { morning: [], afternoon: [], evening: [] };
    for (const iso of activeDay?.slots ?? []) buckets[periodOf(iso)].push(iso);
    return PERIOD_ORDER.filter((p) => buckets[p].length > 0).map((p) => ({ period: p, slots: buckets[p] }));
  }, [activeDay]);

  function validate(): boolean {
    const next: Errors = {};
    if (!slot) next.slot = f.errSlot[lang];
    if (!name.trim()) next.name = f.errName[lang];
    if (!EMAIL_RE.test(email.trim())) next.email = f.errEmail[lang];
    if (digitsOf(phone).length < 6) next.phone = f.errPhone[lang];
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate() || !slot) return;

    // Backend appointment lang accepts fr|en only; fall back AR → FR.
    const bookingLang: "fr" | "en" = lang === "en" ? "en" : "fr";

    setSubmitting(true);
    const res = await createAppointment({
      dentistProfileId,
      patientName: name.trim(),
      patientEmail: email.trim(),
      patientPhone: phone.trim() || undefined,
      patientAddress: address.trim() || undefined,
      message: message.trim() || undefined,
      requestedAt: slot,
      lang: bookingLang,
    });
    setSubmitting(false);

    if (res.ok) {
      setSuccess(true);
      return;
    }

    if (res.status === 409) {
      // Someone grabbed the slot first — surface the next opening and refetch.
      setSlot(null);
      onRefresh();
      setFormError(
        res.nextAvailable
          ? f.conflictError[lang].replace("{date}", formatDateTime(res.nextAvailable, lang))
          : f.conflictErrorNoNext[lang],
      );
      return;
    }

    setFormError(f.bookingError[lang]);
  }

  // ── Success ──
  if (success) {
    return (
      <div className="mt-5 overflow-hidden border border-[rgba(25,25,25,0.12)]">
        <div className="bg-[var(--sc-sun-3)] px-6 py-7 text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="sc-serif text-[1.35rem] font-medium text-[var(--sc-black)]">
            {f.successTitle[lang]}
          </p>
          <p className="mx-auto mt-2 max-w-[420px] text-[0.9rem] leading-7 text-[var(--sc-text-mid)]">
            {f.successBody[lang]}
          </p>
        </div>
        <div className="border-t border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] px-6 py-5">
          <p className="mb-3 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-sun-deep)]">
            {f.successNextTitle[lang]}
          </p>
          <ol className="space-y-3">
            {[f.successStep1[lang], f.successStep2[lang]].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--sc-black)] text-[0.68rem] font-bold tabular-nums text-[var(--sc-black)]">
                  {i + 1}
                </span>
                <span className="text-[0.9rem] leading-6 text-[var(--sc-text-mid)]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  // ── Loading / error / no availability ──
  if (loading) {
    return (
      <div className="mt-5 space-y-3" aria-busy="true">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 w-14 animate-pulse bg-[rgba(25,25,25,0.06)]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 animate-pulse bg-[rgba(25,25,25,0.06)]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !hasSlots) {
    return (
      <div className="mt-5 border border-[rgba(25,25,25,0.12)] bg-[rgba(25,25,25,0.02)] px-5 py-6 text-center">
        <p className="text-[0.9rem] leading-7 text-[var(--sc-text-mid)]">
          {error ? f.loadError[lang] : f.noSlots[lang]}
        </p>
        {!error && availability?.nextAvailable && (
          <p className="mt-1.5 text-[0.9rem] font-medium text-[var(--sc-black)]">
            {f.nextAvailable[lang].replace("{date}", formatDateTime(availability.nextAvailable, lang))}
          </p>
        )}
        {error && (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-3 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[var(--sc-sun-deep)] underline underline-offset-4 hover:text-[var(--sc-black)]"
          >
            {f.retry[lang]}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4" noValidate>
      {!slot && (
        <p className="mb-4 text-[0.88rem] leading-6 text-[var(--sc-text-mid)]">{f.bookIntro[lang]}</p>
      )}

      {/* ── Selected-slot summary (once a time is picked) ── */}
      {slot ? (
        <div className="flex items-center justify-between gap-3 border border-[rgba(25,25,25,0.12)] bg-[var(--sc-sun-3)] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--sc-black)] text-[var(--sc-sun)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 2v4M16 2v4M3 9h18M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
                {f.selectedSlot[lang]}
              </p>
              <p className="truncate text-[0.92rem] font-medium text-[var(--sc-black)]">
                {formatDateTime(slot, lang)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSlot(null);
              setErrors((prev) => ({ ...prev, slot: undefined }));
            }}
            className="shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[var(--sc-black)] underline underline-offset-4 hover:text-[var(--sc-sun-deep)]"
          >
            {f.changeSlot[lang]}
          </button>
        </div>
      ) : (
        <>
          {/* ── Day selector ── */}
          <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
            {f.selectDay[lang]}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]">
            {days.map((day) => {
              const on = day.date === activeDay?.date;
              const d = new Date(day.slots[0]);
              const wk = d.toLocaleDateString(localeOf(lang), { weekday: "short" }).replace(".", "");
              const dayNum = d.toLocaleDateString(localeOf(lang), { day: "numeric" });
              const mo = d.toLocaleDateString(localeOf(lang), { month: "short" }).replace(".", "");
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setActiveDate(day.date)}
                  aria-pressed={on}
                  className={[
                    "flex min-w-[62px] shrink-0 flex-col items-center gap-0.5 border px-2.5 py-2.5 transition-colors",
                    on
                      ? "border-[var(--sc-black)] bg-[var(--sc-black)] text-[var(--sc-white)]"
                      : "border-[rgba(25,25,25,0.16)] text-[var(--sc-black)] hover:border-[var(--sc-black)]",
                  ].join(" ")}
                >
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] opacity-70">{wk}</span>
                  <span className="text-[1.2rem] font-medium leading-none tabular-nums">{dayNum}</span>
                  <span className="text-[0.58rem] uppercase tracking-[0.06em] opacity-70">{mo}</span>
                  <span
                    className={[
                      "mt-0.5 h-1 w-1 rounded-full",
                      on ? "bg-[var(--sc-sun)]" : "bg-[var(--sc-sun-deep)]",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          {/* ── Time slots, grouped by period ── */}
          <div className="mt-5 space-y-4">
            {periods.map(({ period, slots }) => (
              <div key={period}>
                <p className="mb-2 text-[0.68rem] font-medium text-[var(--sc-text-mid)]">
                  {f[period][lang]}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => {
                        setSlot(iso);
                        setErrors((prev) => ({ ...prev, slot: undefined }));
                      }}
                      className="min-h-10 border border-[rgba(25,25,25,0.16)] px-2 py-2 text-[0.85rem] font-medium tabular-nums text-[var(--sc-black)] transition-colors hover:border-[var(--sc-black)] hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
                    >
                      {formatTime(iso, lang)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {errors.slot && !slot && (
        <p className="mt-2 text-[0.8rem] text-red-600">{errors.slot}</p>
      )}

      {/* ── Details — revealed once a slot is chosen ── */}
      {slot && (
        <fieldset className="mt-6 border-t border-[rgba(25,25,25,0.1)] pt-5">
          <legend className="mb-4 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
            {f.yourInfo[lang]}
          </legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={f.fullName[lang]} value={name} onChange={setName} placeholder={f.fullNamePlaceholder[lang]} error={errors.name} autoComplete="name" required />
            <Field label={f.phone[lang]} value={phone} onChange={setPhone} placeholder={f.phonePlaceholder[lang]} error={errors.phone} type="tel" autoComplete="tel" required />
            <Field label={f.email[lang]} value={email} onChange={setEmail} placeholder={f.emailPlaceholder[lang]} error={errors.email} type="email" autoComplete="email" required className="sm:col-span-2" />
            <Field label={f.addressOptional[lang]} value={address} onChange={setAddress} placeholder={f.addressPlaceholder[lang]} autoComplete="street-address" className="sm:col-span-2" />
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--sc-text-mid)]">
              {f.message[lang]}
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={f.messagePlaceholder[lang]}
              rows={3}
              className="w-full resize-y border border-[rgba(25,25,25,0.18)] bg-[var(--sc-white)] px-3 py-2 text-[0.9rem] text-[var(--sc-black)] outline-none transition-colors focus:border-[var(--sc-black)]"
            />
          </label>

          {formError && (
            <p className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-red-700" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="sc-serif mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] transition-colors hover:bg-[rgba(25,25,25,0.85)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? f.submitting[lang] : f.submit[lang]}
          </button>
        </fieldset>
      )}

      <span className="sr-only">{practitionerName}</span>
    </form>
  );
}

/** One labelled text input with inline error linked via aria-describedby. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
  autoComplete,
  required,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
}) {
  const errId = error ? `err-${label.replace(/\s+/g, "-")}` : undefined;
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--sc-text-mid)]">
        {label}
        {required && <span className="text-[var(--sc-sun-deep)]"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={errId}
        className={[
          "w-full border bg-[var(--sc-white)] px-3 py-2.5 text-[0.9rem] text-[var(--sc-black)] outline-none transition-colors focus:border-[var(--sc-black)]",
          error ? "border-red-400" : "border-[rgba(25,25,25,0.18)]",
        ].join(" ")}
      />
      {error && (
        <span id={errId} className="mt-1 block text-[0.78rem] text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
