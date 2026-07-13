"use client";

import { useMemo, useState, type FormEvent } from "react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { createAppointment, type AvailabilityResponse } from "../../_lib/finder";
import { formatDateTime, formatDayMonth, formatTime } from "./format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Group non-empty days for the slot picker.
  const days = useMemo(
    () => (availability?.days ?? []).filter((d) => d.slots.length > 0),
    [availability],
  );

  const hasSlots = days.length > 0;

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

  // ── Success state ──
  if (success) {
    return (
      <div className="mt-6 border border-[rgba(25,25,25,0.12)] bg-[var(--sc-sun-3)] p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="sc-serif text-[1.15rem] font-medium text-[var(--sc-black)]">
          {f.successTitle[lang]}
        </p>
        <p className="mx-auto mt-2 max-w-[420px] text-[0.9rem] leading-7 text-[var(--sc-text-mid)]">
          {f.successBody[lang]}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6" noValidate>
      {/* ── Slot picker ── */}
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
        {f.chooseSlot[lang]}
      </p>

      {loading && (
        <p className="mt-3 text-[0.9rem] text-[var(--sc-text-mid)]">{f.slotsLoading[lang]}</p>
      )}

      {!loading && (error || !hasSlots) && (
        <div className="mt-3 border border-[rgba(25,25,25,0.12)] bg-[rgba(25,25,25,0.02)] p-4 text-[0.9rem] leading-7 text-[var(--sc-text-mid)]">
          <p>{error ? f.loadError[lang] : f.noSlots[lang]}</p>
          {!error && availability?.nextAvailable && (
            <p className="mt-1 font-medium text-[var(--sc-black)]">
              {f.nextAvailable[lang].replace(
                "{date}",
                formatDateTime(availability.nextAvailable, lang),
              )}
            </p>
          )}
        </div>
      )}

      {!loading && !error && hasSlots && (
        <div className="mt-3 max-h-[240px] space-y-4 overflow-y-auto pr-1">
          {days.map((day) => (
            <div key={day.date}>
              <p className="mb-2 text-[0.8rem] font-medium text-[var(--sc-black)]">
                <span className="text-[var(--sc-text-mid)]">{f.days[day.dayOfWeek]?.[lang] ?? day.dayOfWeek}</span>{" "}
                {formatDayMonth(day.slots[0], lang)}
              </p>
              <div className="flex flex-wrap gap-2">
                {day.slots.map((iso) => {
                  const active = slot === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => {
                        setSlot(iso);
                        setErrors((prev) => ({ ...prev, slot: undefined }));
                      }}
                      aria-pressed={active}
                      className={[
                        "min-h-9 px-3 py-1.5 text-[0.82rem] font-medium transition-colors",
                        active
                          ? "bg-[var(--sc-black)] text-[var(--sc-white)]"
                          : "border border-[rgba(25,25,25,0.18)] text-[var(--sc-black)] hover:border-[var(--sc-black)] hover:bg-[rgba(25,25,25,0.04)]",
                      ].join(" ")}
                    >
                      {formatTime(iso, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {errors.slot && (
        <p className="mt-2 text-[0.8rem] text-red-600">{errors.slot}</p>
      )}

      {/* ── Details ── only unlocked once a slot is chosen ── */}
      {slot && (
        <fieldset className="mt-6 border-t border-[rgba(25,25,25,0.1)] pt-5">
          <legend className="sr-only">{f.yourInfo[lang]}</legend>

          <p className="mb-3 text-[0.9rem] text-[var(--sc-text-mid)]">
            <span className="font-medium text-[var(--sc-black)]">{f.selectedSlot[lang]}:</span>{" "}
            {formatDateTime(slot, lang)}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={f.fullName[lang]}
              value={name}
              onChange={setName}
              placeholder={f.fullNamePlaceholder[lang]}
              error={errors.name}
              autoComplete="name"
              required
            />
            <Field
              label={f.phone[lang]}
              value={phone}
              onChange={setPhone}
              placeholder={f.phonePlaceholder[lang]}
              error={errors.phone}
              type="tel"
              autoComplete="tel"
              required
            />
            <Field
              label={f.email[lang]}
              value={email}
              onChange={setEmail}
              placeholder={f.emailPlaceholder[lang]}
              error={errors.email}
              type="email"
              autoComplete="email"
              required
              className="sm:col-span-2"
            />
            <Field
              label={f.addressOptional[lang]}
              value={address}
              onChange={setAddress}
              placeholder={f.addressPlaceholder[lang]}
              autoComplete="street-address"
              className="sm:col-span-2"
            />
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
              className="w-full resize-y border border-[rgba(25,25,25,0.18)] bg-[var(--sc-white)] px-3 py-2 text-[0.9rem] text-[var(--sc-black)] outline-none focus:border-[var(--sc-black)]"
            />
          </label>

          {formError && (
            <p className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="sc-serif mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] transition-colors hover:bg-[rgba(25,25,25,0.85)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? f.submitting[lang] : f.submit[lang]}
          </button>
        </fieldset>
      )}

      <span className="sr-only">{practitionerName}</span>
    </form>
  );
}

/** One labelled text input with inline error. */
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
        className={[
          "w-full border bg-[var(--sc-white)] px-3 py-2 text-[0.9rem] text-[var(--sc-black)] outline-none focus:border-[var(--sc-black)]",
          error ? "border-red-400" : "border-[rgba(25,25,25,0.18)]",
        ].join(" ")}
      />
      {error && <span className="mt-1 block text-[0.78rem] text-red-600">{error}</span>}
    </label>
  );
}
