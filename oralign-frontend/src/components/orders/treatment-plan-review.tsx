'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  ClipboardPaste,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Maximize2,
  Send,
  Stethoscope,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// Dialog primitives are no longer used directly — the three full-view
// modals (IPR reference, clinical photo, dental treatment table) all
// go through the shared <ImageLightbox> below, which owns the
// Radix Dialog primitives at the right layer to avoid the
// rounded-corners / ring / popover-bg artefacts the default shadcn
// DialogContent introduces on a full-bleed modal.
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { getAccessToken } from '@/lib/api';
import { ordersService } from '@/lib/api/orders.service';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import {
  useApproveTreatmentPlan,
  useDeleteDentalTreatmentTableImage,
  useDeleteMovementTableImage,
  useGeneratePublicLink,
  useMarkTreatmentPlanReady,
  useRejectTreatmentPlan,
  useRemoveTreatmentPlanIpr,
  useTreatmentPlanReview,
  useUpdateResultViewUrl,
  useUploadDentalTreatmentTableImage,
  useUploadMovementTableImage,
  useUpsertTreatmentPlanIpr,
} from '@/lib/hooks/use-treatment-plans';
import { useUpdateToothInstructions } from '@/lib/hooks/use-orders';
import { useAuth } from '@/lib/providers/auth-provider';
import { TreatmentConversation } from './treatment-conversation';
import {
  OrderFile,
  OrderFileCategory,
  ToothInstruction,
  ToothInstructionType,
  TreatmentPlanStatus,
  UserRole,
} from '@/lib/types';

// Defer the odontogram (its sprite payload is heavy) — same pattern as the
// order-detail page, so React only loads the SVG sprite once per session.
// The loading fallback is its own client component so the placeholder text
// can flip with the language toggle (can't call a hook at module scope).
function OdontogramLoading() {
  const { t } = useT();
  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      {t('orderDetail.loadingOdontogram')}
    </div>
  );
}

const OdontogramSelector = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((m) => ({
      default: m.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => <OdontogramLoading />,
  },
);

// ─── Viewer mode helpers (Internal vs External smart-shell) ─────────────────
// All the actual logic lives in `@/lib/viewer/smart-shell` — shared with
// the public patient page (`/created_for_you/[token]`) and the /test QA
// page so the branding behaviour is identical everywhere.
//
// Mode is encoded in the resultViewUrl as a `#external` / `#internal`
// hash so we don't need a Prisma migration. No hash defaults to
// external (branded). Internal must be an explicit opt-out.

import {
  type ViewerMode,
  parseViewerMode,
  prepareViewer,
  stripViewerHash,
  withViewerHash,
} from '@/lib/viewer/smart-shell';

const parseDentalNumber = (raw?: string | null): number | null => {
  if (!raw) return null;
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const isLikelyLegacySwappedIpr = (
  value?: string | null,
  note?: string | null,
): boolean => {
  const valueNumber = parseDentalNumber(value);
  const noteNumber = parseDentalNumber(note);
  return (
    valueNumber !== null &&
    noteNumber !== null &&
    valueNumber > 2 &&
    noteNumber >= 0 &&
    noteNumber <= 2
  );
};

interface Props {
  treatmentPlanId: string;
  /** Current user's role — used for client-side affordances only. The
   *  backend re-enforces every action. */
  role: UserRole;
  /** WebSocket-live status driven by the parent's order-scoped subscription
   *  (see TreatmentPlansSection in /dashboard/orders/[id]/page.tsx). The
   *  socket lives at the order level so plan-list and chat updates flow
   *  through a single shared connection. */
  socketConnected?: boolean;
}

/**
 * The doctor / admin / designer review screen for a single Treatment Plan.
 *
 * Layout (spec):
 *   1. Treatment Viewer
 *   2. Movement Table / Odontogram
 *   3. Conversation / Chat
 */
export function TreatmentPlanReview({
  treatmentPlanId,
  role,
  socketConnected = false,
}: Props) {
  const { t } = useT();
  const reviewQuery = useTreatmentPlanReview(treatmentPlanId);
  const review = reviewQuery.data;
  const { user } = useAuth();

  if (reviewQuery.isLoading || !review) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {reviewQuery.error
          ? t('treatmentReview.loadFailed')
          : t('treatmentReview.loading')}
      </div>
    );
  }

  const isPlanner =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER;
  const isDoctor = role === UserRole.DENTIST;
  const isApproved = review.status === TreatmentPlanStatus.APPROVED;
  // Approve / Reject is a DOCTOR-only action. The bar is ALWAYS visible
  // for the doctor — buttons enable/disable based on plan state so the
  // doctor never has to hunt for them when the designer flips status.
  const showApproval = isDoctor;

  return (
    <div className="space-y-6">
      <PlanHeader review={review} role={role} isDoctor={isDoctor} />

      {/* Persistent celebration banner once the plan is approved — gives
          everyone a clear "this is locked in" signal at the top. */}
      {isApproved && (
        <Card className="border-2 border-emerald-300 bg-emerald-50 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-emerald-900">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">
                {t('treatmentReview.approvedBanner.title')}
              </p>
              <p className="text-xs text-emerald-900/80">
                {t('treatmentReview.approvedBanner.approvedPrefix')}
                {review.approvedAt
                  ? ` ${t('treatmentReview.approvedBanner.approvedOn', {
                      date: format(new Date(review.approvedAt), 'MMM d, yyyy'),
                    })}`
                  : ''}
                . {t('treatmentReview.approvedBanner.inManufacturing')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <TreatmentViewerCard review={review} canEdit={isPlanner} isDoctor={isDoctor} />

      <MovementTableSection
        review={review}
        canEdit={isPlanner}
        treatmentPlanId={treatmentPlanId}
      />

      {/* New clinical artefact, placed AFTER the Treatment odontogram
          (which lives inside MovementTableSection) and BEFORE the
          clinical image gallery — per the clinical team's layout
          request. */}
      <DentalTreatmentTableSection
        review={review}
        canEdit={isPlanner}
        treatmentPlanId={treatmentPlanId}
      />

      {/* Clinical image gallery — extracted from MovementTableSection
          so it can sit after the Dental treatment table. The order
          now reads: odontogram (inside MovementTable) → Dental
          treatment table → Clinical photos → Chat. */}
      <ClinicalImagesSection review={review} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            {t('treatmentReview.conversationCardTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TreatmentConversation
            orderId={review.orderId}
            activePlanId={treatmentPlanId}
            messages={review.messages}
            role={role}
            currentUserId={user?.id ?? ''}
            connected={socketConnected}
          />
        </CardContent>
      </Card>

      {isPlanner &&
        (review.status === TreatmentPlanStatus.PENDING ||
          review.status === TreatmentPlanStatus.REJECTED) && (
          <ReadyAction review={review} />
        )}

      {/* ─── Approve / Reject sits at the BOTTOM of the page so the doctor
            scrolls through the plan + chat first, then commits. The card
            is only rendered for doctors when the plan is READY — admins
            don't get to sign off on behalf of the doctor anymore. */}
      {showApproval && <ApprovalActions review={review} />}
    </div>
  );
}

function ReadyAction({
  review,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
}) {
  const { t } = useT();
  const markReady = useMarkTreatmentPlanReady();
  const isResend = review.status === TreatmentPlanStatus.REJECTED;
  return (
    <Card
      className={cn(
        isResend && 'border-2 border-orange-300 bg-orange-50/40',
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">
            {isResend
              ? t('treatmentReview.ready.resendTitle')
              : t('treatmentReview.ready.sendTitle')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isResend
              ? `${t('treatmentReview.ready.resendDescBefore')} (v${
                  review.version + 1
                }) ${t('treatmentReview.ready.resendDescAfter')}`
              : t('treatmentReview.ready.sendDesc')}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => markReady.mutate(review.id)}
          disabled={markReady.isPending}
          className={cn('gap-2', isResend && 'bg-orange-600 hover:bg-orange-700')}
        >
          {markReady.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {isResend
            ? t('treatmentReview.ready.createNewVersion')
            : t('treatmentReview.ready.markReady')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Header (title + status + public-link generator) ────────────────────────

function PlanHeader({
  review,
  role,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  role: UserRole;
  /** Reserved for future per-role customisations of the header — kept on
   *  the prop signature so callers don't need to know which child reads
   *  it. Currently unused. */
  isDoctor: boolean;
}) {
  const { t } = useT();
  const generate = useGeneratePublicLink();
  // Public-link generation is now also available to doctors (the order
  // owner) so they can hand the link directly to their patient without
  // routing through an admin.
  const canSharePublicly =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER ||
    role === UserRole.DENTIST;

  const publicUrl = review.publicToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/created_for_you/${review.publicToken}`
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {review.name}
            <Badge variant="outline" className="text-xs">
              v{review.version}
            </Badge>
            <StatusBadge status={review.status} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('treatmentReview.header.createdLabel')}{' '}
            {format(new Date(review.createdAt), 'MMM d, yyyy HH:mm')}
            {review.approvedAt &&
              ` · ${t('treatmentReview.header.approvedLabel')} ${format(new Date(review.approvedAt), 'MMM d, yyyy')}`}
            {review.rejectedAt &&
              ` · ${t('treatmentReview.header.rejectedLabel')} ${format(new Date(review.rejectedAt), 'MMM d, yyyy')}`}
          </p>
        </div>

        {canSharePublicly && (
          <div className="flex flex-wrap items-center gap-2">
            {publicUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  void navigator.clipboard?.writeText(publicUrl);
                }}
                title={publicUrl}
              >
                <Link2 className="h-4 w-4" />
                {t('treatmentReview.header.copyPatientLink')}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => generate.mutate({ id: review.id, validDays: 30 })}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {review.publicToken
                ? t('treatmentReview.header.rotatePatientLink')
                : t('treatmentReview.header.generatePatientLink')}
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: TreatmentPlanStatus }) {
  const { t } = useT();
  const variants: Record<TreatmentPlanStatus, [string, string]> = {
    [TreatmentPlanStatus.PENDING]: [
      t('treatmentReview.status.pending'),
      'bg-amber-100 text-amber-800 border-amber-200',
    ],
    [TreatmentPlanStatus.READY]: [
      t('treatmentReview.status.ready'),
      'bg-blue-100 text-blue-800 border-blue-200',
    ],
    [TreatmentPlanStatus.APPROVED]: [
      t('treatmentReview.status.approved'),
      'bg-emerald-100 text-emerald-800 border-emerald-200',
    ],
    [TreatmentPlanStatus.REJECTED]: [
      t('treatmentReview.status.rejected'),
      'bg-red-100 text-red-800 border-red-200',
    ],
  };
  const [label, className] = variants[status];
  return (
    <Badge variant="outline" className={cn('border', className)}>
      {label}
    </Badge>
  );
}

// ─── 1 · Treatment Viewer ───────────────────────────────────────────────────

function TreatmentViewerCard({
  review,
  canEdit,
  isDoctor,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  canEdit: boolean;
  /** Doctors don't need to know whether the viewer is internal or
   *  external — the smart-shell branding makes it look the same. We
   *  hide the badge + mode toggle for them. */
  isDoctor: boolean;
}) {
  const { t } = useT();
  // Saved URL → derive both the displayable URL (hash stripped) and the
  // viewer mode (internal vs external smart-shell) from the hash.
  const savedMode = parseViewerMode(review.resultViewUrl);
  const savedCleanUrl = review.resultViewUrl
    ? stripViewerHash(review.resultViewUrl)
    : '';

  const [urlDraft, setUrlDraft] = useState(savedCleanUrl);
  const [modeDraft, setModeDraft] = useState<ViewerMode>(savedMode);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const updateUrl = useUpdateResultViewUrl();

  // Resync drafts when the upstream plan changes (e.g. someone else saved
  // a URL via WebSocket invalidation).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlDraft(savedCleanUrl);
    setModeDraft(savedMode);
  }, [savedCleanUrl, savedMode]);

  // prepareViewer does the right thing for every URL:
  //   • Hirsch.html → rewrite to Viewer/main.html (logo gone at the
  //     source — no CSS occlusion needed) and wrap in branded shell.
  //   • Other URLs + external mode → wrap in branded srcDoc shell.
  //   • Other URLs + internal mode → plain iframe `src`, no shell.
  const viewerSlot = useMemo(() => {
    if (!savedCleanUrl) return { src: undefined, srcDoc: undefined };
    return prepareViewer(savedCleanUrl, savedMode);
  }, [savedMode, savedCleanUrl]);
  const srcDoc = viewerSlot.srcDoc ?? '';
  const directSrc = viewerSlot.src ?? '';

  const handleSave = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    updateUrl.mutate({
      id: review.id,
      resultViewUrl: withViewerHash(trimmed, modeDraft),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('treatmentReview.viewer.title')}
          {/* Internal/External is a planner concept — never shown to
              doctors. They see the branded viewer regardless of mode. */}
          {review.resultViewUrl && !isDoctor && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                savedMode === 'external'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900',
              )}
            >
              {savedMode === 'external' ? (
                <Globe className="mr-1 h-3 w-3" />
              ) : (
                <Lock className="mr-1 h-3 w-3" />
              )}
              {savedMode === 'external'
                ? t('treatmentReview.viewer.externalBadge')
                : t('treatmentReview.viewer.internalBadge')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {review.resultViewUrl ? (
          <>
            {/* Generous viewer box — patients and doctors rotate the 3D
                model here, so it deserves real screen real-estate.
                Phones: 3:4 portrait. Tablets+: 4:3. Desktop capped at
                75vh so the page chrome still fits on tall monitors. */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border bg-muted sm:aspect-[4/3] lg:max-h-[75vh]">
              {!iframeBlocked ? (
                <iframe
                  // Re-key on URL+mode so toggling actually swaps the iframe.
                  key={`${savedCleanUrl}::${savedMode}`}
                  src={srcDoc ? undefined : directSrc || undefined}
                  srcDoc={srcDoc || undefined}
                  title={t('treatmentReview.viewer.iframeTitle')}
                  className="absolute inset-0 h-full w-full"
                  // Internal trusted viewers can keep allow-same-origin (they
                  // run on our infrastructure). External smart-shells live
                  // in srcDoc — same-origin is fine there too because the
                  // outer shell is same-origin; only the inner iframe is
                  // cross-origin and gets its own sandbox.
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                  allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                  onError={() => setIframeBlocked(true)}
                />
              ) : (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                  {t('treatmentReview.viewer.cannotEmbed')}
                </div>
              )}
            </div>
            {/* "Open in full view" link removed — the embedded viewer is
                already big enough and the extra button just made the
                card noisy. */}
          </>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t('treatmentReview.viewer.notAvailable')}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-2">
              <label
                htmlFor={`viewer-url-${review.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t('treatmentReview.viewer.urlLabel')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`viewer-url-${review.id}`}
                  type="url"
                  placeholder="https://viewer.example.com/cases/abc"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('treatmentReview.viewer.typeLabel')}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <ViewerModeOption
                  selected={modeDraft === 'internal'}
                  icon={<Lock className="h-4 w-4 text-emerald-600" />}
                  title={t('treatmentReview.viewer.internalTitle')}
                  description={t('treatmentReview.viewer.internalDesc')}
                  onSelect={() => setModeDraft('internal')}
                />
                <ViewerModeOption
                  selected={modeDraft === 'external'}
                  icon={<Globe className="h-4 w-4 text-amber-600" />}
                  title={t('treatmentReview.viewer.externalTitle')}
                  description={t('treatmentReview.viewer.externalDesc')}
                  onSelect={() => setModeDraft('external')}
                />
              </div>
            </fieldset>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={!urlDraft.trim() || updateUrl.isPending}
                className="gap-2"
              >
                {updateUrl.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t('treatmentReview.viewer.saveViewer')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ViewerModeOption({
  selected,
  icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition',
        'hover:border-primary/60 hover:bg-background',
        selected
          ? 'border-primary bg-background shadow-sm ring-1 ring-primary/30'
          : 'border-muted bg-muted/30',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border',
          selected
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-muted-foreground/20 bg-background text-muted-foreground',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

// ─── 2 · Movement Table / Odontogram ────────────────────────────────────────
// The OdontogramSelector handles color-coded per-tooth instructions
// (NO_ATTACHMENTS, DO_NOT_MOVE, NO_IPR, EXTRACT). On top of that the
// planner picks ONE of two ways to record interproximal reduction (IPR):
//   • "Per-tooth" — purple bars rendered BETWEEN adjacent teeth in the
//     odontogram, with mm values inline. Click a slot to set/edit.
//   • "Reference image" — upload an annotated CAD-software export.
// Both are persisted: the toggle is purely a UI choice that selects which
// editor to show. The doctor and public viewer see whichever is populated.

type IprMode = 'per-tooth' | 'image';

// ── Two strictly-disjoint type sets ───────────────────────────────
// The treatment odontogram now renders TWO layers:
//
//   1. DOCTOR_ORDER_COLOR_TYPES — set by the prescribing doctor on
//      the order itself (No Attachments / Do Not Move / No IPR /
//      Extract). On this surface they are READ-ONLY: shown as a
//      coloured background so the planner can see clinical context
//      while placing attachments, but not clickable.
//
//   2. PLANNER_TREATMENT_COLOR_TYPES — set by the planner on this
//      editor (Attachment only, in pink). This is what the picker
//      shows in `mode="attachments"`.
//
// Keep these disjoint — a tooth that has BOTH a doctor flag AND a
// planner attachment is rendered pink on this treatment surface, with
// the doctor colour retained as a small reference marker.
const DOCTOR_ORDER_COLOR_TYPES = new Set<string>([
  ToothInstructionType.NO_ATTACHMENTS,
  ToothInstructionType.DO_NOT_MOVE,
  ToothInstructionType.NO_IPR,
  ToothInstructionType.EXTRACT,
]);

const PLANNER_TREATMENT_COLOR_TYPES = new Set<string>([
  ToothInstructionType.ATTACHMENT,
]);

// Each slot carries an i18n LABEL KEY (not a raw title string) so the
// label flips with the language toggle — resolved with t() inside the
// component (see ClinicalImagesSection's useMemo). Mirrors the
// `titleKey` pattern in order-file-upload.tsx; no t() at module scope.
const TREATMENT_CLINICAL_IMAGE_SLOTS = [
  {
    category: OrderFileCategory.LEFT_PHOTO,
    labelKey: 'treatmentReview.clinical.slots.leftLateral',
  },
  {
    category: OrderFileCategory.FRONT_PHOTO,
    labelKey: 'treatmentReview.clinical.slots.frontalOcclusion',
  },
  {
    category: OrderFileCategory.RIGHT_PHOTO,
    labelKey: 'treatmentReview.clinical.slots.rightLateral',
  },
  {
    category: OrderFileCategory.UPPER_PHOTO,
    labelKey: 'treatmentReview.clinical.slots.upperOcclusal',
  },
  {
    category: OrderFileCategory.LOWER_PHOTO,
    labelKey: 'treatmentReview.clinical.slots.lowerOcclusal',
  },
] as const;

function isDoctorOrderColorType(type: string): type is ToothInstructionType {
  return DOCTOR_ORDER_COLOR_TYPES.has(type);
}

function isPlannerTreatmentColorType(
  type: string,
): type is ToothInstructionType {
  return PLANNER_TREATMENT_COLOR_TYPES.has(type);
}

function useAuthenticatedObjectUrl(url?: string | null) {
  const [state, setState] = useState<{
    objectUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({ objectUrl: null, loading: !!url, error: null });
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ objectUrl: null, loading: false, error: null });
      return undefined;
    }

    let active = true;
    const token = getAccessToken();
    setState({ objectUrl: null, loading: true, error: null });

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load image preview');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setState({ objectUrl, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!active) return;
        setState({ objectUrl: null, loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  return state;
}

function MovementTableSection({
  review,
  canEdit,
  treatmentPlanId,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  canEdit: boolean;
  treatmentPlanId: string;
}) {
  const { t } = useT();
  const upload = useUploadMovementTableImage();
  const remove = useDeleteMovementTableImage();
  const updateInstructions = useUpdateToothInstructions();
  // IPR / STEP lives in its own table now. Each contact upsert
  // is one round-trip — no race with the tooth-instructions endpoint,
  // no P2002 collisions.
  const upsertIpr = useUpsertTreatmentPlanIpr(treatmentPlanId);
  const removeIpr = useRemoveTreatmentPlanIpr(treatmentPlanId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullView, setFullView] = useState(false);

  const imageUrl = useMemo(
    () =>
      review.movementTableImagePath
        ? `${treatmentPlansService.movementTableImageUrl(treatmentPlanId)}?t=${review.updatedAt}`
        : null,
    [review.movementTableImagePath, review.updatedAt, treatmentPlanId],
  );
  const iprImage = useAuthenticatedObjectUrl(imageUrl);

  // Clinical-image-gallery state was hoisted to a sibling section
  // (`ClinicalImagesSection`) so it can be reordered independently of
  // the odontogram/IPR block above. See the parent render in
  // `TreatmentPlanReview` for the new section order:
  //   MovementTable → DentalTreatmentTable → ClinicalImages → Chat.

  // ── Decompose the review payload into THREE cleanly-separated layers:
  //
  //     • orderColors — doctor's prescription flags (No Attachments /
  //       Do Not Move / No IPR / Extract). Rendered as a READ-ONLY
  //       background so the planner sees clinical context while
  //       placing attachments. The planner CANNOT change these on
  //       this surface — they live on the order and are edited on
  //       the order detail page only.
  //
  //     • colorInstructions — planner-set ATTACHMENT marks (pink).
  //       Stored in OrderToothInstruction, written via
  //       `updateToothInstructions`. The picker in `mode="attachments"`
  //       only shows the pink swatch, so the planner can't write any
  //       other type from here.
  //
  //     • iprMap / iprNotes — per-CONTACT IPR mm value + optional
  //       STEP value, keyed by the right-anchor tooth number to
  //       match the OdontogramSelector's render contract. Sourced
  //       from the dedicated TreatmentPlanIpr table via the new
  //       `review.iprEntries` field, written via upsertIpr / removeIpr.
  //       The old `ipr_value` rows on tooth instructions have been
  //       migrated out and the endpoint now rejects them — the team
  //       gets a clear error if any client still tries to write that
  //       legacy shape.
  const { orderColors, colorInstructions, iprMap, iprNotes } = useMemo(() => {
    const doctorColors: ToothInstruction[] = [];
    const plannerColors: ToothInstruction[] = [];
    for (const { toothNumber, entries } of review.odontogram ?? []) {
      for (const e of entries) {
        if (isDoctorOrderColorType(e.type)) {
          doctorColors.push({ toothNumber, type: e.type });
        } else if (isPlannerTreatmentColorType(e.type)) {
          plannerColors.push({ toothNumber, type: e.type });
        }
        // Ignore any stray `ipr_value` rows — they're legacy data
        // from before the migration. The backend will eventually
        // catch up on the migration's DELETE if any slipped through.
      }
    }
    const ipr = new Map<number, string>();
    const notes = new Map<number, string>();
    for (const row of review.iprEntries ?? []) {
      // Key by toTooth (right anchor) — matches what
      // OdontogramSelector expects in `iprValues` / `iprNotes`.
      if (isLikelyLegacySwappedIpr(row.value, row.note)) {
        ipr.set(row.toTooth, row.note as string);
        notes.set(row.toTooth, row.value);
        continue;
      }
      if (row.value) ipr.set(row.toTooth, row.value);
      if (row.note) notes.set(row.toTooth, row.note);
    }
    return {
      orderColors: doctorColors,
      colorInstructions: plannerColors,
      iprMap: ipr,
      iprNotes: notes,
    };
  }, [review.odontogram, review.iprEntries]);

  // Default the toggle based on what data the plan already has — if an image
  // was uploaded, show the image tab; otherwise show per-tooth.
  const [iprMode, setIprMode] = useState<IprMode>(() =>
    review.movementTableImagePath ? 'image' : 'per-tooth',
  );

  /**
   * Persist the colour layer of the treatment odontogram (No Attachments
   * / Do Not Move / No IPR / Extract / Attachment). This endpoint is
   * REPLACE-ALL on the order's tooth instructions — sending an array
   * with `colors` wipes everything else of those types and rewrites.
   *
   * Defence-in-depth dedupe by (toothNumber, type) so any stale state
   * never ships a duplicate row that would trip the unique constraint.
   * IPR no longer flows through this endpoint at all — it lives in
   * TreatmentPlanIpr with its own dedicated mutations below.
   */
  // Depend on the STABLE `.mutate` references (react-query keeps their
  // identity across renders) rather than the mutation result objects,
  // which are recreated on every pending/success flip — otherwise these
  // callbacks (and the memoized odontogram they feed) would churn on
  // each render.
  const { mutate: mutateInstructions } = updateInstructions;
  const { mutate: mutateUpsertIpr } = upsertIpr;
  const { mutate: mutateRemoveIpr } = removeIpr;

  const persistInstructions = useCallback(
    (colors: ToothInstruction[]) => {
      const deduped = new Map<string, ToothInstruction>();
      for (const row of colors) {
        deduped.set(`${row.toothNumber}:${row.type}`, row);
      }
      // Scope this save to ATTACHMENT only — the treatment-plan editor
      // owns just that one type. The backend will wipe + recreate ONLY
      // ATTACHMENT rows for this order, preserving the doctor's
      // No Attachments / Do Not Move / No IPR / Extract prescriptions
      // that show as the read-only background layer.
      //
      // Bug this fixes: without the scope, the very first save from
      // this surface deleted every OrderToothInstruction row including
      // the doctor's, so the order odontogram appeared to "lose" all
      // four flags as soon as the planner placed any attachment.
      mutateInstructions({
        id: review.orderId,
        instructions: Array.from(deduped.values()),
        replaceTypes: [ToothInstructionType.ATTACHMENT],
      });
    },
    [review.orderId, mutateInstructions],
  );

  /**
   * IPR / STEP commit — runs via the dedicated upsertIpr mutation
   * (a single PUT under /treatment-plans/:id/iprs). The backend uses
   * `prisma.treatmentPlanIpr.upsert` keyed on (planId, fromTooth,
   * toTooth) so re-saving the same contact updates the row in place.
   * No P2002 collisions are possible because there's no replace-all
   * transaction to race; the conflict resolution is atomic inside
   * Postgres.
   *
   * Clearing both `value` and `note` is interpreted as a DELETE so
   * the contact disappears from the arch — no zombie zero-value rows.
   */
  const handleIprChange = useCallback(
    (
      fromTooth: number,
      toTooth: number,
      payload: { value: string | null; note: string | null },
    ) => {
      const trimmedValue = payload.value?.trim() ?? '';
      const trimmedNote = payload.note?.trim() ?? '';
      if (!trimmedValue && !trimmedNote) {
        mutateRemoveIpr({ fromTooth, toTooth });
        return;
      }
      if (!trimmedValue) {
        // STEP without an IPR mm — the backend requires a
        // value, so use '0' as a sentinel meaning "no reduction, just
        // a staged contact marker". The UI renders the STEP pill regardless.
        mutateUpsertIpr({
          fromTooth,
          toTooth,
          value: '0',
          note: trimmedNote.length > 0 ? trimmedNote : null,
        });
        return;
      }
      mutateUpsertIpr({
        fromTooth,
        toTooth,
        value: trimmedValue,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
    },
    [mutateUpsertIpr, mutateRemoveIpr],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          {t('treatmentReview.odontogram.cardTitle')}
        </CardTitle>
        {canEdit && (
          <IprModeToggle value={iprMode} onChange={setIprMode} />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <OdontogramSelector
          // mode="attachments" → the picker shows ONLY the pink
          // ATTACHMENT swatch. The planner can click teeth to add /
          // remove attachments and can click between-tooth contacts
          // for IPR + Step values. Doctor-level flags are NOT
          // editable here — they come in via `readonlyValue` below.
          mode="attachments"
          value={colorInstructions}
          onChange={persistInstructions}
          // ── Doctor's order odontogram painted as a read-only
          //    background. Lets the planner see clinical context
          //    (No Attachments / Do Not Move / No IPR / Extract)
          //    while placing attachments, without risking accidental
          //    edits. If both layers paint the same tooth, the
          //    OdontogramSelector renders the planner attachment as
          //    the pink fill and keeps the doctor colour as a small
          //    reference marker.
          readonlyValue={orderColors}
          disabled={
            !canEdit ||
            updateInstructions.isPending ||
            upsertIpr.isPending ||
            removeIpr.isPending
          }
          // Non-blocking "Enregistrement…" chip next to the heading while
          // a tooth/IPR persist is in flight (the disabled flip above
          // already prevents double submits — this makes it VISIBLE).
          saving={
            updateInstructions.isPending ||
            upsertIpr.isPending ||
            removeIpr.isPending
          }
          iprValues={iprMap}
          iprNotes={iprNotes}
          // Combined IPR commit — receives `{ value, note }` in one
          // call. STEP input is shown because iprNotes is wired.
          onIprChange={
            iprMode === 'per-tooth' && canEdit ? handleIprChange : undefined
          }
          title={t('treatmentReview.odontogram.selectorTitle')}
          subtitle={t('treatmentReview.odontogram.selectorSubtitle')}
        />

        {/* Editor instructions — only relevant when the planner is in
            per-tooth mode and can actually click slots. */}
        {iprMode === 'per-tooth' && canEdit && (
          <div className="grid gap-3 rounded-xl border bg-purple-50/40 p-3 text-xs text-purple-900 sm:grid-cols-[auto_1fr]">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">
                {t('treatmentReview.odontogram.perToothTitle')}
              </p>
              <p className="text-purple-900/80">
                {t('treatmentReview.odontogram.perToothDesc')}
              </p>
            </div>
          </div>
        )}

        {/* ── 2b · IPR reference image (planner uploads CAD export) ──
              Show the image whenever it exists — regardless of which mode
              the admin/designer has the editor on, and regardless of
              role. The image is data, not a mode-specific affordance. The
              empty "Upload an image" placeholder only renders when the
              admin is in image-edit mode. */}
        {(imageUrl || (iprMode === 'image' && canEdit)) && (
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {t('treatmentReview.iprImage.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('treatmentReview.iprImage.desc')}
                </p>
              </div>
              {canEdit && iprMode === 'image' && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={upload.isPending}
                    className="gap-2"
                  >
                    {upload.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {imageUrl
                      ? t('treatmentReview.iprImage.replaceImage')
                      : t('treatmentReview.iprImage.uploadImage')}
                  </Button>
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove.mutate(treatmentPlanId)}
                      disabled={remove.isPending}
                      className="gap-2 text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('treatmentReview.iprImage.remove')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {imageUrl ? (
              <>
                <div className="w-full overflow-x-auto rounded-lg border bg-white">
                  {iprImage.loading ? (
                    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('treatmentReview.iprImage.loadingImage')}
                    </div>
                  ) : iprImage.objectUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={iprImage.objectUrl}
                        alt={t('treatmentReview.iprImage.alt')}
                        className="block max-h-[480px] w-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="flex h-48 items-center justify-center text-sm text-red-600">
                      {iprImage.error ?? t('treatmentReview.iprImage.loadError')}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFullView(true)}
                    disabled={!iprImage.objectUrl}
                    className="gap-2"
                  >
                    <Maximize2 className="h-4 w-4" />
                    {t('treatmentReview.iprImage.viewFullSize')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                <ImageIcon className="mx-auto mb-1 h-4 w-4 opacity-50" />
                {t('treatmentReview.iprImage.noImage')}
              </div>
            )}
          </div>
        )}

        {/* ClinicalImageGallery moved to its own sibling section so
            the planner can see Dental treatment table BEFORE the
            clinical photo strip — see <ClinicalImagesSection> below
            and the parent render in <TreatmentPlanReview>. */}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (file) upload.mutate({ id: treatmentPlanId, file });
          }}
        />

        {/* Full-screen IPR reference image. The shared <ImageLightbox>
            avoids the default DialogContent's rounded-corners + ring +
            popover-bg artefacts that used to bleed through the dark
            backdrop and made the modal look "corrupt" at the edges. */}
        <ImageLightbox
          open={fullView}
          onOpenChange={setFullView}
          src={iprImage.objectUrl}
          alt={t('treatmentReview.iprImage.lightboxAlt')}
          caption={t('treatmentReview.iprImage.lightboxCaption')}
        />

        {/* The clinical-image preview Dialog moved with the gallery —
            it now lives inside <ClinicalImagesSection>. */}
      </CardContent>
    </Card>
  );
}

// ─── Clinical image views (sibling section) ──────────────────────────────
//
// Hoisted out of MovementTableSection so its position can be reordered
// independently. The clinical team asked to see the Dental treatment
// table BEFORE this gallery — keeping it as its own card under the
// parent gives a clean section stack:
//
//   MovementTable → DentalTreatmentTable → ClinicalImages → Chat
//
// Owns the preview-modal state because that modal is gallery-local;
// no other surface opens a "clinical photo full view" dialog.

function ClinicalImagesSection({
  review,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
}) {
  const { t } = useT();
  const [clinicalPreview, setClinicalPreview] = useState<{
    src: string;
    label: string;
    name?: string;
  } | null>(null);

  const getOrderImageUrl = useCallback(
    (file: OrderFile) => {
      const base =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      // `variant=lg` — one ~1600px WebP serves BOTH the gallery card and
      // the lightbox (they share the same blob), replacing the multi-MB
      // original this used to pull per slot. The backend falls back to
      // the original automatically for legacy/unprocessed files.
      return `${base}${ordersService.getDownloadUrl(review.orderId, file.id)}?variant=lg&t=${file.createdAt}`;
    },
    [review.orderId],
  );

  const clinicalImageSlots = useMemo(() => {
    const latestByCategory = new Map<OrderFileCategory, OrderFile>();
    for (const file of review.clinicalImages ?? []) {
      if (!latestByCategory.has(file.category)) {
        latestByCategory.set(file.category, file);
      }
    }
    return TREATMENT_CLINICAL_IMAGE_SLOTS.map((slot) => ({
      category: slot.category,
      label: t(slot.labelKey),
      file: latestByCategory.get(slot.category),
    }));
  }, [review.clinicalImages, t]);

  return (
    <>
      <ClinicalImageGallery
        slots={clinicalImageSlots}
        getImageUrl={getOrderImageUrl}
        onPreview={setClinicalPreview}
      />

      {/* Clinical photo full-view — shared lightbox, solid black bg,
          no rounded-corners / ring artefacts. */}
      <ImageLightbox
        open={!!clinicalPreview}
        onOpenChange={(next) => {
          if (!next) setClinicalPreview(null);
        }}
        src={clinicalPreview?.src}
        alt={clinicalPreview?.label ?? t('treatmentReview.clinical.fallbackAlt')}
        caption={clinicalPreview?.label}
        subCaption={clinicalPreview?.name}
      />
    </>
  );
}

type ClinicalImageSlot = {
  category: OrderFileCategory;
  label: string;
  file?: OrderFile;
};

function ClinicalImageGallery({
  slots,
  getImageUrl,
  onPreview,
}: {
  slots: ClinicalImageSlot[];
  getImageUrl: (file: OrderFile) => string;
  onPreview: (preview: { src: string; label: string; name?: string }) => void;
}) {
  const { t } = useT();
  const uploadedCount = slots.filter((slot) => slot.file).length;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">
            {t('treatmentReview.clinical.galleryTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('treatmentReview.clinical.galleryDesc')}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-full">
          {t('treatmentReview.clinical.uploadedBadge', {
            n: uploadedCount,
            total: slots.length,
          })}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {slots.map((slot) => (
          <ClinicalImageCard
            key={slot.category}
            slot={slot}
            imageUrl={slot.file ? getImageUrl(slot.file) : null}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  );
}

function ClinicalImageCard({
  slot,
  imageUrl,
  onPreview,
}: {
  slot: ClinicalImageSlot;
  imageUrl: string | null;
  onPreview: (preview: { src: string; label: string; name?: string }) => void;
}) {
  const { t } = useT();
  const preview = useAuthenticatedObjectUrl(imageUrl);
  const file = slot.file;

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{slot.label}</p>
        {file && <ImageIcon className="h-4 w-4 text-primary" />}
      </div>

      {file ? (
        <>
          <button
            type="button"
            onClick={() =>
              preview.objectUrl &&
              onPreview({
                src: preview.objectUrl,
                label: slot.label,
                name: file.originalName,
              })
            }
            disabled={!preview.objectUrl}
            className="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/20 disabled:cursor-not-allowed sm:h-44"
          >
            {preview.loading ? (
              <span className="flex items-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {t('treatmentReview.clinical.loading')}
              </span>
            ) : preview.objectUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.objectUrl}
                  alt={slot.label}
                  className="h-full w-full object-contain p-2"
                />
                <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5" />
                  {t('treatmentReview.clinical.view')}
                </span>
              </>
            ) : (
              <span className="px-3 text-center text-xs text-red-600">
                {preview.error ?? t('treatmentReview.clinical.loadError')}
              </span>
            )}
          </button>
          <p
            className="mt-2 truncate text-[11px] text-muted-foreground"
            title={file.originalName}
          >
            {file.originalName}
          </p>
        </>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-center text-xs text-muted-foreground sm:h-44">
          <ImageIcon className="mb-2 h-5 w-5 opacity-50" />
          {t('treatmentReview.clinical.notUploaded')}
        </div>
      )}
    </div>
  );
}

/**
 * Segmented control for choosing between the per-tooth IPR editor (purple
 * bars in the odontogram) and the image-upload editor. Visually styled to
 * match the rest of the dashboard — pill background with a sliding active
 * indicator.
 */
function IprModeToggle({
  value,
  onChange,
}: {
  value: IprMode;
  onChange: (mode: IprMode) => void;
}) {
  const { t } = useT();
  return (
    <div
      role="tablist"
      aria-label={t('treatmentReview.iprToggle.ariaLabel')}
      className="inline-flex items-center rounded-lg border bg-muted p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'per-tooth'}
        onClick={() => onChange('per-tooth')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          value === 'per-tooth'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Stethoscope className="h-3.5 w-3.5" />
        {t('treatmentReview.iprToggle.perTooth')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'image'}
        onClick={() => onChange('image')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          value === 'image'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {t('treatmentReview.iprToggle.byImage')}
      </button>
    </div>
  );
}
// ─── Dental treatment table ("traitement dentaire") ──────────────────────
//
// Second image artefact on every treatment plan, distinct from the
// orthodontic movement table inside `MovementTableSection`. The clinical
// team uploads a per-tooth restorative / endo / extraction plan as an
// image — the doctor reads it inline.
//
// Surfaced as its own card so the planner + doctor both immediately
// recognise it as a separate document, not a variant of the movement
// table. Rendered AFTER the Treatment odontogram per the clinical
// team's layout request.
function DentalTreatmentTableSection({
  review,
  canEdit,
  treatmentPlanId,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  canEdit: boolean;
  treatmentPlanId: string;
}) {
  const { t } = useT();
  const upload = useUploadDentalTreatmentTableImage();
  const remove = useDeleteDentalTreatmentTableImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullView, setFullView] = useState(false);

  // ?t=updatedAt cache-buster — the URL stays stable across uploads
  // but the query string changes, so the browser re-fetches the new
  // bytes instead of serving the previous image from cache.
  const imageUrl = useMemo(
    () =>
      review.dentalTreatmentTableImagePath
        ? `${treatmentPlansService.dentalTreatmentTableImageUrl(treatmentPlanId)}?t=${review.updatedAt}`
        : null,
    [review.dentalTreatmentTableImagePath, review.updatedAt, treatmentPlanId],
  );
  // Same authenticated-blob-URL pattern the movement-table section
  // uses (see useAuthenticatedObjectUrl above) — required because
  // the GET endpoint is behind the JWT guard.
  const imageBlob = useAuthenticatedObjectUrl(imageUrl);

  const handlePickFile = (file: File) => {
    upload.mutate({ id: treatmentPlanId, file });
  };

  // ── Paste-from-clipboard ─────────────────────────────────────────
  // Two entry points so the planner can paste a screenshot without
  // ever leaving the keyboard:
  //
  //   1. Ctrl-V / Cmd-V on a focused dropzone — `onPaste` reads the
  //      bytes directly out of the React clipboard event. Works in
  //      every browser; the dropzone is `tabIndex=0` so a click
  //      (or Tab-to-focus) puts it in receive-paste mode.
  //
  //   2. A dedicated "Paste" button that uses the asynchronous
  //      `navigator.clipboard.read()` API. Slicker when it works
  //      but requires the page to be in focus AND the user to
  //      have granted clipboard read permission (the browser asks
  //      on first use). We fall back to a toast when either of
  //      those fails so the user knows the Ctrl-V path still works.
  //
  // Either path goes through `handlePastedFile`, which validates
  // the file LOCALLY (mime + size) before hitting the upload
  // mutation. The backend re-validates on its own; the client
  // check just avoids a pointless round-trip on obvious failures.

  const handlePastedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('treatmentReview.dentalTable.toasts.notImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('treatmentReview.dentalTable.toasts.tooLarge'));
      return;
    }
    upload.mutate({ id: treatmentPlanId, file });
  };

  const handleClipboardEventPaste = (
    event: React.ClipboardEvent<HTMLDivElement>,
  ) => {
    if (!canEdit || upload.isPending || remove.isPending) return;
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          handlePastedFile(file);
          return;
        }
      }
    }
  };

  const handlePasteButtonClick = async () => {
    if (!canEdit) return;
    // Modern Clipboard API path. Browsers gate this behind a user
    // gesture + permission prompt, so it can throw — fall through
    // to a friendly toast pointing the user at Ctrl-V.
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      'read' in navigator.clipboard
    ) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipItem of clipboardItems) {
          const imgType = clipItem.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await clipItem.getType(imgType);
            const ext = imgType.split('/')[1] ?? 'png';
            const file = new File([blob], `pasted-image.${ext}`, {
              type: imgType,
            });
            handlePastedFile(file);
            return;
          }
        }
        toast.error(t('treatmentReview.dentalTable.toasts.noImageOnClipboard'));
        return;
      } catch (err) {
        // Permission denied, no clipboard data, or browser doesn't
        // support read(). Surface a hint pointing at Ctrl-V — that
        // path doesn't need any permission grant.
        const message =
          err instanceof Error && err.message
            ? err.message
            : t('treatmentReview.dentalTable.toasts.clipboardReadFailed');
        toast.error(
          `${message}. ${t('treatmentReview.dentalTable.toasts.clipboardReadTip')}`,
        );
        return;
      }
    }
    toast.error(t('treatmentReview.dentalTable.toasts.noProgrammaticRead'));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          {t('treatmentReview.dentalTable.cardTitle')}
          <span className="text-xs font-normal text-muted-foreground">
            {t('treatmentReview.dentalTable.cardSubtitle')}
          </span>
        </CardTitle>
        {canEdit && imageUrl && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending || remove.isPending}
              className="gap-2"
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t('treatmentReview.dentalTable.replace')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePasteButtonClick}
              disabled={upload.isPending || remove.isPending}
              className="gap-2"
            >
              <ClipboardPaste className="h-4 w-4" />
              {t('treatmentReview.dentalTable.paste')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => remove.mutate(treatmentPlanId)}
              disabled={upload.isPending || remove.isPending}
              className="gap-2 text-destructive hover:text-destructive"
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('treatmentReview.dentalTable.remove')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('treatmentReview.dentalTable.desc')}
        </p>

        {imageUrl ? (
          // tabIndex + onPaste mirror the empty-state dropzone so the
          // planner can also paste a NEW screenshot directly over the
          // existing one (replace via Ctrl-V) without going through
          // the file picker.
          <div
            tabIndex={canEdit ? 0 : -1}
            onPaste={handleClipboardEventPaste}
            className="overflow-hidden rounded-2xl border bg-card shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={
              canEdit
                ? t('treatmentReview.dentalTable.pasteAriaExisting')
                : undefined
            }
          >
            {imageBlob.loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('treatmentReview.dentalTable.loadingImage')}
              </div>
            ) : imageBlob.error ? (
              <div className="flex h-40 items-center justify-center text-sm text-destructive">
                {imageBlob.error}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFullView(true)}
                className="group block w-full"
                aria-label={t('treatmentReview.dentalTable.viewFullAria')}
              >
                {imageBlob.objectUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageBlob.objectUrl}
                    alt={t('treatmentReview.dentalTable.imageAlt')}
                    className="max-h-[640px] w-full object-contain transition group-hover:scale-[1.005]"
                  />
                )}
              </button>
            )}
            {review.dentalTreatmentTableImageName && (
              <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {review.dentalTreatmentTableImageName}
                </span>
                <button
                  type="button"
                  onClick={() => setFullView(true)}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <Maximize2 className="h-3 w-3" />
                  {t('treatmentReview.dentalTable.openFullView')}
                </button>
              </div>
            )}
          </div>
        ) : canEdit ? (
          // Dropzone is `tabIndex=0` + `onPaste` so the planner can
          // click it once (giving it keyboard focus) and then press
          // Ctrl-V to upload a screenshot directly. The focus-visible
          // ring tells them paste is armed.
          <div
            tabIndex={0}
            onPaste={handleClipboardEventPaste}
            className="rounded-2xl border-2 border-dashed bg-muted/20 p-6 outline-none transition focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={t('treatmentReview.dentalTable.dropzoneAria')}
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {t('treatmentReview.dentalTable.noImageYet')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('treatmentReview.dentalTable.dropHintBefore')}{' '}
                  <kbd className="rounded border bg-background px-1 font-mono text-[10px]">
                    Ctrl
                  </kbd>{' '}
                  +{' '}
                  <kbd className="rounded border bg-background px-1 font-mono text-[10px]">
                    V
                  </kbd>{' '}
                  {t('treatmentReview.dentalTable.dropHintAfter')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={upload.isPending}
                  className="gap-2"
                >
                  {upload.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t('treatmentReview.dentalTable.uploadImage')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasteButtonClick}
                  disabled={upload.isPending}
                  className="gap-2"
                >
                  <ClipboardPaste className="h-4 w-4" />
                  {t('treatmentReview.dentalTable.pasteFromClipboard')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
            {t('treatmentReview.dentalTable.readonlyEmpty')}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePickFile(file);
            e.currentTarget.value = '';
          }}
        />
      </CardContent>

      {/* Full-screen viewer — shared <ImageLightbox> so the dental
          treatment table opens with the same clean solid-black
          experience as the clinical photo gallery. ESC, X button,
          click-outside-image all close. */}
      <ImageLightbox
        open={fullView}
        onOpenChange={setFullView}
        src={imageBlob.objectUrl}
        alt={t('treatmentReview.dentalTable.lightboxAlt')}
        caption={t('treatmentReview.dentalTable.lightboxCaption')}
        subCaption={review.dentalTreatmentTableImageName ?? undefined}
      />
    </Card>
  );
}

// ─── Approve / Reject ──────────────────────────────────────────────────────
// Visually elevated to a "decision card" because the doctor lands on this
// page specifically to make this call. Amber border + "Action required"
// header make it unmissable when scrolling, even with the chat below it.

/**
 * Always-visible Approve / Reject bar.
 *
 * Rendered for the doctor on every treatment plan, sticky to the bottom
 * of the page so the action is one click away no matter how far down the
 * doctor has scrolled. No banner text — the buttons speak for themselves.
 * The buttons are enabled only when the plan is in READY status; outside
 * READY they show disabled with a tiny status hint so the doctor knows
 * why they can't act yet.
 */
function ApprovalActions({
  review,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
}) {
  const { t } = useT();
  const approve = useApproveTreatmentPlan();
  const reject = useRejectTreatmentPlan();
  const isReady = review.status === TreatmentPlanStatus.READY;
  const isApproved = review.status === TreatmentPlanStatus.APPROVED;
  const isRejected = review.status === TreatmentPlanStatus.REJECTED;
  const busy = approve.isPending || reject.isPending;
  const disabled = !isReady || busy;

  const statusHint = isApproved
    ? t('treatmentReview.approval.alreadyApproved')
    : isRejected
      ? t('treatmentReview.approval.wasRejected')
      : !isReady
        ? t('treatmentReview.approval.awaitingDesigner')
        : null;

  return (
    <div className="sticky bottom-0 -mx-4 mt-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      {statusHint && (
        <p className="mb-2 text-center text-xs text-muted-foreground">
          {statusHint}
        </p>
      )}
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => reject.mutate(review.id)}
          disabled={disabled}
          className="h-12 gap-2 border-red-300 bg-white text-red-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reject.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <X className="h-5 w-5" />
          )}
          {t('treatmentReview.approval.reject')}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => approve.mutate(review.id)}
          disabled={disabled}
          className="h-12 gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approve.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          {t('treatmentReview.approval.approve')}
        </Button>
      </div>
    </div>
  );
}
