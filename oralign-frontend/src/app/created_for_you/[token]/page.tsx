/**
 * Public Treatment Viewer page.
 *
 * Token-only access — no authentication. The backend rate-limits this
 * endpoint and only returns display-safe fields (no conversation,
 * attachments, or private patient data).
 *
 * Branded with the showcase navbar + footer (see ../layout.tsx) so the
 * patient lands inside the Oralign brand experience. The embedded viewer
 * itself uses the same smart-shell + logo-injection script as the QA
 * /test page, so third-party viewers (Hirsch, etc.) appear under an
 * Oralign overlay instead of their own branding.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import { prepareViewer, stripViewerHash } from '@/lib/viewer/smart-shell';
import type { PublicTreatmentViewerPayload } from '@/lib/types';

/**
 * Build a warm, VIP-feeling salutation for the patient.
 *
 *   Dear Mr. John,        (male)
 *   Dear Ms. Sarah,       (female)
 *   Dear Alex,            (other / unknown)
 *   Hello and welcome,    (no first name on file)
 *
 * Patient first name comes from the doctor's CRM, so it's whatever they
 * typed — we just trim it. We deliberately don't fall back to the full
 * name to avoid leaking surnames to anyone who finds the share link.
 */
function patientSalutation(
  firstName: string | null | undefined,
  gender: 'male' | 'female' | 'other' | null | undefined,
): string {
  const name = (firstName ?? '').trim();
  if (!name) return 'Hello and welcome';
  if (gender === 'male') return `Dear Mr. ${name}`;
  if (gender === 'female') return `Dear Ms. ${name}`;
  return `Dear ${name}`;
}

/**
 * Format the doctor's name with the "Dr." courtesy title. Falls back to
 * a generic "your dentist" so the welcome line still reads naturally if
 * the backend payload happens to be missing the name (data migration,
 * deleted user, etc.).
 */
function doctorByline(
  fullName: string | null | undefined,
  clinicName: string | null | undefined,
): string {
  const name = (fullName ?? '').trim();
  if (name) return name.toLowerCase().startsWith('dr') ? name : `Dr. ${name}`;
  const clinic = (clinicName ?? '').trim();
  if (clinic) return clinic;
  return 'your dentist';
}

// Patient-facing viewers ALWAYS use the branded shell — they're the most
// important place for our logo to be visible, since this is what the
// patient is sharing with friends/family. The shared `prepareViewer`
// helper handles everything: known third-party shells (Hirsch.html) are
// REWRITTEN to their unbranded inner viewer so the wrapper logo never
// even hits the network, and everything else gets the Oralign overlay.

export default function PublicTreatmentViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [payload, setPayload] = useState<PublicTreatmentViewerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid link.');
      return;
    }
    let active = true;
    treatmentPlansService
      .publicByToken(token)
      .then((res) => {
        if (active) setPayload(res);
      })
      .catch(() => {
        if (active)
          setError('This treatment link is no longer available or has expired.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Patient-facing viewer: ALWAYS use the branded shell, regardless of
  // the planner's internal/external setting on the plan. The patient is
  // sharing this link with family / friends — Oralign branding must be
  // present even if the planner happened to flag it as "internal".
  // prepareViewer also rewrites Hirsch.html → Viewer/main.html so the
  // third-party logo never even loads.
  const rawUrl = payload?.treatmentPlan.resultViewUrl ?? null;
  const cleanUrl = rawUrl ? stripViewerHash(rawUrl) : '';
  const viewerSlot = useMemo(() => {
    if (!cleanUrl) return { src: undefined, srcDoc: undefined };
    return prepareViewer(cleanUrl, 'external');
  }, [cleanUrl]);
  const srcDoc = viewerSlot.srcDoc ?? '';

  const salutation = payload
    ? patientSalutation(payload.patient?.firstName, payload.patient?.gender)
    : '';
  const doctorName = payload
    ? doctorByline(payload.doctor?.fullName, payload.doctor?.clinicName)
    : '';

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Slim trust-signal strip — kept because a "secure link" cue is
          reassuring on a no-auth page. */}
      <div className="mb-5 flex justify-center sm:mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Secure shared link
        </span>
      </div>

      {!payload && !error && (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground sm:h-96">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading your treatment plan…
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-center sm:p-6">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <p className="text-sm font-semibold text-red-700">Link unavailable</p>
          <p className="mt-1 text-xs text-red-600/80">{error}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Please contact your dentist to request a new link.
          </p>
        </div>
      )}

      {payload && (
        <>
          {/* ─── VIP welcome ────────────────────────────────────────────
              Personalised salutation + doctor by-line. We deliberately
              drop the technical plan-version label here — the patient
              cares about the smile, not about v1 vs v2. */}
          <div className="mb-6 text-center sm:mb-8">
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-amber-800">
              <Sparkles className="h-3.5 w-3.5" />
              Made for you
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {salutation},
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              We&apos;ve designed this aligner plan especially for you,
              crafted with care by{' '}
              <span className="font-semibold text-foreground">{doctorName}</span>.
              Take a moment to explore it — we hope you love the smile it
              brings.
            </p>
          </div>

          {cleanUrl ? (
            <div className="space-y-4">
              {/* Viewer frame — bigger than before. Patients spend most
                  of their time on this page rotating the 3D model.
                  - Phones: 3:4 portrait (more vertical room)
                  - Tablets+: 4:3 (still tall, less letterbox)
                  - Desktop: up to 78vh (almost full screen) */}
              <div
                className={
                  'relative w-full overflow-hidden rounded-2xl border bg-white shadow-sm ' +
                  'aspect-[3/4] sm:aspect-[4/3] ' +
                  'min-h-[360px] sm:min-h-0 lg:max-h-[78vh]'
                }
              >
                {!iframeBlocked ? (
                  <iframe
                    key={cleanUrl}
                    src={srcDoc ? undefined : viewerSlot.src}
                    srcDoc={srcDoc || undefined}
                    title="Treatment viewer"
                    className="absolute inset-0 h-full w-full"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                    allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                    onError={() => setIframeBlocked(true)}
                  />
                ) : (
                  <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground sm:p-8">
                    The viewer cannot be embedded here. Please contact your
                    dentist for help opening this preview.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-sm font-medium text-amber-800">
                Your treatment preview is being prepared. Please check
                back shortly or contact your dentist.
              </p>
            </div>
          )}

          <p className="mt-10 text-center text-xs text-muted-foreground">
            This private link is meant just for you. No medical records or
            payment details are shared on this page.
          </p>
        </>
      )}
    </section>
  );
}
