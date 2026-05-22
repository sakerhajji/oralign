'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
const OdontogramSelector = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((m) => ({
      default: m.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Loading odontogram…
      </div>
    ),
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
  const reviewQuery = useTreatmentPlanReview(treatmentPlanId);
  const review = reviewQuery.data;
  const { user } = useAuth();

  if (reviewQuery.isLoading || !review) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {reviewQuery.error ? 'Failed to load treatment plan.' : 'Loading…'}
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
              <p className="font-semibold">Treatment plan approved</p>
              <p className="text-xs text-emerald-900/80">
                Approved
                {review.approvedAt
                  ? ` on ${format(new Date(review.approvedAt), 'MMM d, yyyy')}`
                  : ''}
                . The order is now in manufacturing.
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
          (which lives inside MovementTableSection) per the clinical
          team's layout request. */}
      <DentalTreatmentTableSection
        review={review}
        canEdit={isPlanner}
        treatmentPlanId={treatmentPlanId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Treatment Conversation
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
              ? 'Resend treatment plan'
              : 'Send for doctor review'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isResend
              ? 'The doctor rejected this version. Clicking below creates a new versioned plan ' +
                "(v" +
                (review.version + 1) +
                ") and marks it ready for the doctor — the rejected plan stays in history for the audit trail."
              : 'Mark this plan as ready once the viewer URL, movement table, and any result files are in place. The doctor is then unblocked to approve or reject.'}
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
          {isResend ? 'Create new version & resend' : 'Mark as ready for review'}
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
            Created {format(new Date(review.createdAt), 'MMM d, yyyy HH:mm')}
            {review.approvedAt &&
              ` · Approved ${format(new Date(review.approvedAt), 'MMM d, yyyy')}`}
            {review.rejectedAt &&
              ` · Rejected ${format(new Date(review.rejectedAt), 'MMM d, yyyy')}`}
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
                Copy patient link
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
                ? 'Rotate patient link'
                : 'Generate patient link'}
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: TreatmentPlanStatus }) {
  const variants: Record<TreatmentPlanStatus, [string, string]> = {
    [TreatmentPlanStatus.PENDING]: ['Pending', 'bg-amber-100 text-amber-800 border-amber-200'],
    [TreatmentPlanStatus.READY]: ['Ready for review', 'bg-blue-100 text-blue-800 border-blue-200'],
    [TreatmentPlanStatus.APPROVED]: ['Approved', 'bg-emerald-100 text-emerald-800 border-emerald-200'],
    [TreatmentPlanStatus.REJECTED]: ['Rejected', 'bg-red-100 text-red-800 border-red-200'],
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
          Treatment Viewer
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
              {savedMode === 'external' ? 'External viewer' : 'Internal viewer'}
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
                  title="Treatment Viewer"
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
                  The viewer cannot be embedded.
                </div>
              )}
            </div>
            {/* "Open in full view" link removed — the embedded viewer is
                already big enough and the extra button just made the
                card noisy. */}
          </>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Treatment viewer is not available yet.
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-2">
              <label
                htmlFor={`viewer-url-${review.id}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Viewer URL
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
                Viewer type
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <ViewerModeOption
                  selected={modeDraft === 'internal'}
                  icon={<Lock className="h-4 w-4 text-emerald-600" />}
                  title="Internal viewer"
                  description="Trusted viewer hosted by you. Plain iframe, no logo injection."
                  onSelect={() => setModeDraft('internal')}
                />
                <ViewerModeOption
                  selected={modeDraft === 'external'}
                  icon={<Globe className="h-4 w-4 text-amber-600" />}
                  title="External viewer"
                  description="Wrap in Oralign-branded shell with smart logo injection. Use for Hirsch and other third-party 3D viewers."
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
                Save viewer
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

const TREATMENT_CLINICAL_IMAGE_SLOTS = [
  { category: OrderFileCategory.LEFT_PHOTO, label: 'Left lateral view' },
  { category: OrderFileCategory.FRONT_PHOTO, label: 'Frontal occlusion view' },
  { category: OrderFileCategory.RIGHT_PHOTO, label: 'Right lateral view' },
  { category: OrderFileCategory.UPPER_PHOTO, label: 'Upper occlusal view' },
  { category: OrderFileCategory.LOWER_PHOTO, label: 'Lower occlusal view' },
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
  const [clinicalPreview, setClinicalPreview] = useState<{
    src: string;
    label: string;
    name?: string;
  } | null>(null);

  const imageUrl = useMemo(
    () =>
      review.movementTableImagePath
        ? `${treatmentPlansService.movementTableImageUrl(treatmentPlanId)}?t=${review.updatedAt}`
        : null,
    [review.movementTableImagePath, review.updatedAt, treatmentPlanId],
  );
  const iprImage = useAuthenticatedObjectUrl(imageUrl);

  const getOrderImageUrl = useCallback(
    (file: OrderFile) => {
      const base =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      return `${base}${ordersService.getDownloadUrl(review.orderId, file.id)}?t=${file.createdAt}`;
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
      ...slot,
      file: latestByCategory.get(slot.category),
    }));
  }, [review.clinicalImages]);

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
      updateInstructions.mutate({
        id: review.orderId,
        instructions: Array.from(deduped.values()),
        replaceTypes: [ToothInstructionType.ATTACHMENT],
      });
    },
    [review.orderId, updateInstructions],
  );

  const handleColorChange = (next: ToothInstruction[]) => {
    persistInstructions(next);
  };

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
  const handleIprChange = (
    fromTooth: number,
    toTooth: number,
    payload: { value: string | null; note: string | null },
  ) => {
    const trimmedValue = payload.value?.trim() ?? '';
    const trimmedNote = payload.note?.trim() ?? '';
    if (!trimmedValue && !trimmedNote) {
      removeIpr.mutate({ fromTooth, toTooth });
      return;
    }
    if (!trimmedValue) {
      // STEP without an IPR mm — the backend requires a
      // value, so use '0' as a sentinel meaning "no reduction, just
      // a staged contact marker". The UI renders the STEP pill regardless.
      upsertIpr.mutate({
        fromTooth,
        toTooth,
        value: '0',
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
      return;
    }
    upsertIpr.mutate({
      fromTooth,
      toTooth,
      value: trimmedValue,
      note: trimmedNote.length > 0 ? trimmedNote : null,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          Treatment odontogram &amp; IPR
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
          onChange={handleColorChange}
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
          iprValues={iprMap}
          iprNotes={iprNotes}
          // Combined IPR commit — receives `{ value, note }` in one
          // call. STEP input is shown because iprNotes is wired.
          onIprChange={
            iprMode === 'per-tooth' && canEdit ? handleIprChange : undefined
          }
          title="Treatment odontogram"
          subtitle="The doctor's order colours are shown as a background reference. Add pink ATTACHMENT marks on individual teeth, and click the dotted contacts between teeth to set IPR (mm) and Step values."
        />

        {/* Editor instructions — only relevant when the planner is in
            per-tooth mode and can actually click slots. */}
        {iprMode === 'per-tooth' && canEdit && (
          <div className="grid gap-3 rounded-xl border bg-purple-50/40 p-3 text-xs text-purple-900 sm:grid-cols-[auto_1fr]">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">Per-tooth IPR and STEP</p>
              <p className="text-purple-900/80">
                Click the dotted contact between two teeth to add an IPR amount
                in millimetres. Use the STEP field for the aligner step
                reference; both values save together.
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
                <h3 className="text-base font-semibold">IPR reference image</h3>
                <p className="text-xs text-muted-foreground">
                  Upload an IPR map exported from your CAD software. The
                  doctor and public viewer will see this image alongside the
                  odontogram.
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
                    {imageUrl ? 'Replace image' : 'Upload image'}
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
                      Remove
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
                      Loading image…
                    </div>
                  ) : iprImage.objectUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={iprImage.objectUrl}
                        alt="IPR reference image"
                        className="block max-h-[480px] w-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="flex h-48 items-center justify-center text-sm text-red-600">
                      {iprImage.error ?? 'Unable to load image preview.'}
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
                    View full size
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                <ImageIcon className="mx-auto mb-1 h-4 w-4 opacity-50" />
                No IPR image uploaded.
              </div>
            )}
          </div>
        )}

        <ClinicalImageGallery
          slots={clinicalImageSlots}
          getImageUrl={getOrderImageUrl}
          onPreview={setClinicalPreview}
        />

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

        {fullView && iprImage.objectUrl && (
          <Dialog open onOpenChange={() => setFullView(false)}>
            <DialogContent
              className="h-[100dvh] w-screen max-w-none border-0 bg-black/95 p-0 text-white"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">IPR Reference Image</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setFullView(false)}
                className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
                aria-label="Close image viewer"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="flex h-full items-center justify-center p-4 sm:p-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iprImage.objectUrl}
                  alt="IPR reference image — full size"
                  className="max-h-[92dvh] max-w-[96vw] object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {clinicalPreview && (
          <Dialog open onOpenChange={() => setClinicalPreview(null)}>
            <DialogContent
              className="h-[100dvh] w-screen max-w-none border-0 bg-black/95 p-0 text-white"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">
                {clinicalPreview.label}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setClinicalPreview(null)}
                className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
                aria-label="Close image viewer"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="flex h-full flex-col items-center justify-center gap-4 p-4 sm:p-8">
                <div className="text-center">
                  <p className="text-sm font-semibold">{clinicalPreview.label}</p>
                  {clinicalPreview.name && (
                    <p className="text-xs text-white/60">
                      {clinicalPreview.name}
                    </p>
                  )}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clinicalPreview.src}
                  alt={clinicalPreview.label}
                  className="max-h-[84dvh] max-w-[96vw] object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
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
  const uploadedCount = slots.filter((slot) => slot.file).length;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Clinical image views</h3>
          <p className="text-xs text-muted-foreground">
            Order photos sent with the case, shown here for treatment review.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-full">
          {uploadedCount}/{slots.length} uploaded
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
                Loading…
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
                  View
                </span>
              </>
            ) : (
              <span className="px-3 text-center text-xs text-red-600">
                {preview.error ?? 'Unable to load preview.'}
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
          Not uploaded
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
  return (
    <div
      role="tablist"
      aria-label="IPR input mode"
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
        Per-tooth
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
        By image
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          Dental treatment table
          <span className="text-xs font-normal text-muted-foreground">
            (Traitement dentaire)
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
              Replace
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
              Remove
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Per-tooth restorative / endodontic / extraction plan. Separate
          from the orthodontic movement table above — upload it as an image
          (PNG, JPG or WebP, max 10 MB) so the doctor sees the full plan
          alongside the odontogram.
        </p>

        {imageUrl ? (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {imageBlob.loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading image…
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
                aria-label="View dental treatment table full size"
              >
                {imageBlob.objectUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageBlob.objectUrl}
                    alt="Dental treatment table"
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
                  Open full view
                </button>
              </div>
            )}
          </div>
        ) : canEdit ? (
          <div className="rounded-2xl border-2 border-dashed bg-muted/20 p-6">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No image uploaded yet</p>
                <p className="text-xs text-muted-foreground">
                  Upload the dental treatment table as PNG, JPG or WebP.
                </p>
              </div>
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
                Upload image
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
            The dental treatment table will appear here once the planner
            uploads it.
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

      {/* Full-screen viewer — escape closes, click outside closes. */}
      <Dialog open={fullView} onOpenChange={setFullView}>
        <DialogContent
          showCloseButton={false}
          className="h-[92dvh] w-[min(96vw,1280px)] max-w-none overflow-hidden bg-black/90 p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            Dental treatment table — full view
          </DialogTitle>
          <button
            type="button"
            onClick={() => setFullView(false)}
            aria-label="Close full view"
            className="absolute right-3 top-3 z-10 rounded-md bg-black/40 p-2 text-white hover:bg-black/60"
          >
            <X className="h-4 w-4" />
          </button>
          {imageBlob.objectUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageBlob.objectUrl}
              alt="Dental treatment table — full view"
              className="h-full w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
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
  const approve = useApproveTreatmentPlan();
  const reject = useRejectTreatmentPlan();
  const isReady = review.status === TreatmentPlanStatus.READY;
  const isApproved = review.status === TreatmentPlanStatus.APPROVED;
  const isRejected = review.status === TreatmentPlanStatus.REJECTED;
  const busy = approve.isPending || reject.isPending;
  const disabled = !isReady || busy;

  const statusHint = isApproved
    ? 'This plan has already been approved.'
    : isRejected
      ? 'This plan was rejected — the designer will send a new version.'
      : !isReady
        ? 'Awaiting the designer — buttons unlock once the plan is marked ready.'
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
          Reject
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
          Approve
        </Button>
      </div>
    </div>
  );
}
