/**
 * Public Treatment Viewer page.
 *
 * Token-only access — no authentication. The backend rate-limits this
 * endpoint and only returns display-safe fields (no conversation,
 * attachments, or private patient data).
 *
 * Renders OUTSIDE the dashboard layout so the patient never sees a
 * sidebar / dentist UI. Uses the marketing colour system.
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import type { PublicTreatmentViewerPayload } from '@/lib/types';

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-white">
      <header className="border-b bg-white/70 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/ORALIGN BLACK.png"
              alt="Oralign"
              width={32}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Oralign · Treatment Viewer
            </span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure shared link
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {!payload && !error && (
          <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading your treatment plan…
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
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
            <div className="mb-6 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {payload.doctor?.clinicName ?? payload.doctor?.fullName
                  ? `Shared by ${payload.doctor?.clinicName ?? payload.doctor?.fullName}`
                  : 'Your treatment'}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                {payload.patient?.firstName
                  ? `${payload.patient.firstName}'s `
                  : ''}
                {payload.treatmentPlan.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {payload.treatmentPlan.version}
              </p>
            </div>

            {payload.treatmentPlan.resultViewUrl ? (
              <div className="space-y-4">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-white shadow-sm">
                  {!iframeBlocked ? (
                    <iframe
                      src={payload.treatmentPlan.resultViewUrl}
                      title="Treatment viewer"
                      className="absolute inset-0 h-full w-full"
                      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                      onError={() => setIframeBlocked(true)}
                    />
                  ) : (
                    <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
                      The viewer cannot be embedded here. Open it in a new tab below.
                    </div>
                  )}
                </div>
                <div className="flex justify-center">
                  <Button asChild size="lg" className="gap-2">
                    <a
                      href={payload.treatmentPlan.resultViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Treatment Viewer
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-sm font-medium text-amber-800">
                  Your treatment viewer URL is being prepared. Please check
                  back shortly or contact your dentist.
                </p>
              </div>
            )}

            <p className="mt-10 text-center text-xs text-muted-foreground">
              This link gives access to a preview of your treatment only.
              No medical records or payment details are shared.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
