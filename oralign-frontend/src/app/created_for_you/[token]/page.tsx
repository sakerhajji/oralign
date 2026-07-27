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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import {
  PublicViewerFetchError,
  treatmentPlansService,
} from '@/lib/api/treatment-plans.service';
import {
  parseViewerMode,
  prepareViewer,
  stripViewerHash,
} from '@/lib/viewer/smart-shell';
import { dict } from '../../(showcase)/_lib/i18n/dict';
import { useShowcaseLang } from '../../(showcase)/_lib/i18n/lang-context';
import type { PublicTreatmentViewerPayload } from '@/lib/types';

// This route is wrapped by the SHOWCASE LangProvider (see ../layout.tsx),
// not the dashboard one — so translations must come from the showcase
// dictionary. Using the dashboard useT() here silently rendered raw key
// paths: that provider is never mounted on this public route, and its
// context fallback just echoes the key back.
type PublicCaseKey = keyof typeof dict.publicCase;
type Translate = (key: PublicCaseKey, vars?: Record<string, string | number>) => string;

/** publicCase translator bound to the showcase language switcher. */
function usePublicCaseT(): Translate {
  const { lang } = useShowcaseLang();
  return useCallback(
    (key: PublicCaseKey, vars?: Record<string, string | number>) => {
      let text: string = dict.publicCase[key][lang];
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );
}

/**
 * Build a warm, VIP-feeling salutation for the patient.
 *
 *   Cher M. John,         (male)
 *   Chère Mme Sarah,      (female)
 *   Cher·e Alex,          (other / unknown)
 *   Bonjour et bienvenue, (no first name on file)
 *
 * Patient first name comes from the doctor's CRM, so it's whatever they
 * typed — we just trim it. We deliberately don't fall back to the full
 * name to avoid leaking surnames to anyone who finds the share link.
 */
function patientSalutation(
  t: Translate,
  firstName: string | null | undefined,
  gender: 'male' | 'female' | 'other' | null | undefined,
): string {
  const name = (firstName ?? '').trim();
  if (!name) return t('salutationHello');
  if (gender === 'male') return t('salutationMr', { name });
  if (gender === 'female') return t('salutationMs', { name });
  return t('salutationNeutral', { name });
}

/**
 * Format the doctor's name with the "Dr." courtesy title. Falls back to
 * a generic "your dentist" so the welcome line still reads naturally if
 * the backend payload happens to be missing the name (data migration,
 * deleted user, etc.).
 */
function doctorByline(
  t: Translate,
  fullName: string | null | undefined,
  clinicName: string | null | undefined,
): string {
  const name = (fullName ?? '').trim();
  if (name) return name.toLowerCase().startsWith('dr') ? name : `Dr. ${name}`;
  const clinic = (clinicName ?? '').trim();
  if (clinic) return clinic;
  return t('doctorFallback');
}

// Patient-facing viewers honour the planner's "Type de visualiseur"
// choice, exactly like the doctor-side review screen: the mode saved on
// the plan (#internal / #external hash on the URL) decides whether the
// client gets the plain direct viewer (internal) or the Oralign-branded
// shell (external). The shared `prepareViewer` helper handles the rest:
// known third-party shells (Hirsch.html) are REWRITTEN to their unbranded
// inner viewer so the wrapper logo never even hits the network.

export default function PublicTreatmentViewerPage() {
  const t = usePublicCaseT();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [payload, setPayload] = useState<PublicTreatmentViewerPayload | null>(null);
  // The error is stored as a dictionary KEY (not a translated string) so
  // an already-displayed error re-renders in the new language when the
  // patient uses the navbar switcher.
  const [errorKey, setErrorKey] = useState<'invalidLink' | 'expiredLink' | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const visibleErrorKey = !token ? 'invalidLink' : errorKey;

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    treatmentPlansService
      .publicByToken(token)
      .then((res) => {
        if (!active) return;
        setPayload(res);
        setErrorKey(null);
      })
      .catch((error) => {
        if (!active) return;
        setPayload(null);
        if (
          error instanceof PublicViewerFetchError &&
          error.status !== 410 &&
          error.errorCode !== 'PUBLIC_LINK_EXPIRED'
        ) {
          setErrorKey('invalidLink');
          return;
        }
        setErrorKey('expiredLink');
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Respect the planner's saved viewer type ("Type de visualiseur"):
  // the mode travels in the stored URL's #internal / #external hash.
  //   • internal → plain direct iframe, no shell (same as admin preview)
  //   • external → Oralign-branded smart shell (default)
  // This used to hardcode 'external', so a plan flagged "interne" still
  // showed the branded shell to the client — the choice was ignored.
  // prepareViewer still rewrites Hirsch.html → Viewer/main.html so the
  // third-party logo never even loads.
  const rawUrl = payload?.treatmentPlan.resultViewUrl ?? null;
  const savedMode = parseViewerMode(rawUrl);
  const cleanUrl = rawUrl ? stripViewerHash(rawUrl) : '';
  const viewerSlot = useMemo(() => {
    if (!cleanUrl) return { src: undefined, srcDoc: undefined };
    return prepareViewer(cleanUrl, savedMode);
  }, [cleanUrl, savedMode]);
  const srcDoc = viewerSlot.srcDoc ?? '';

  const salutation = payload
    ? patientSalutation(t, payload.patient?.firstName, payload.patient?.gender)
    : '';
  const doctorName = payload
    ? doctorByline(t, payload.doctor?.fullName, payload.doctor?.clinicName)
    : '';

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Slim trust-signal strip — kept because a "secure link" cue is
          reassuring on a no-auth page. */}
      <div className="mb-5 flex justify-center sm:mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('secureLink')}
        </span>
      </div>

      {!payload && !visibleErrorKey && (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground sm:h-96">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      )}

      {visibleErrorKey && (
        <div className="mx-auto grid min-h-[52vh] max-w-lg place-items-center py-10">
          <div className="w-full rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="h-6 w-6" />
            </span>
            <p className="text-lg font-semibold text-foreground">
              {t('linkUnavailableTitle')}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(visibleErrorKey)}
            </p>
            <p className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              {t('requestNewLink')}
            </p>
          </div>
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
              {t('madeForYou')}
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {salutation},
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t('welcomeBefore')}{' '}
              <span className="font-semibold text-foreground">{doctorName}</span>
              {t('welcomeAfter')}
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
                    // Re-key on URL + mode so a viewer-type change on the
                    // plan actually swaps the iframe content.
                    key={`${cleanUrl}#${savedMode}`}
                    src={srcDoc ? undefined : viewerSlot.src}
                    srcDoc={srcDoc || undefined}
                    title={t('viewerTitle')}
                    className="absolute inset-0 h-full w-full"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                    allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                    onError={() => setIframeBlocked(true)}
                  />
                ) : (
                  <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground sm:p-8">
                    {t('iframeBlocked')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-sm font-medium text-amber-800">
                {t('previewPreparing')}
              </p>
            </div>
          )}

          <p className="mt-10 text-center text-xs text-muted-foreground">
            {t('privacyNote')}
          </p>
        </>
      )}
    </section>
  );
}
