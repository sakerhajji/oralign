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
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import {
  useApproveTreatmentPlan,
  useDeleteMovementTableImage,
  useGeneratePublicLink,
  useMarkTreatmentPlanReady,
  useRejectTreatmentPlan,
  useTreatmentPlanReview,
  useUpdateResultViewUrl,
  useUploadMovementTableImage,
} from '@/lib/hooks/use-treatment-plans';
import { useUpdateToothInstructions } from '@/lib/hooks/use-orders';
import { useAuth } from '@/lib/providers/auth-provider';
import { TreatmentConversation } from './treatment-conversation';
import {
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
  isDoctor: _isDoctor,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullView, setFullView] = useState(false);

  const imageUrl = useMemo(
    () =>
      review.movementTableImagePath
        ? `${treatmentPlansService.movementTableImageUrl(treatmentPlanId)}?t=${review.updatedAt}`
        : null,
    [review.movementTableImagePath, review.updatedAt, treatmentPlanId],
  );

  // ── Decompose the review odontogram into:
  //     • Color instructions: attachment markers (treatment-plan editor
  //       collapses to a single attachment colour via mode='attachments').
  //     • IPR values: ipr_value entries with `value` in mm.
  //     • IPR notes: the optional "stripping" secondary value stored on
  //       the same ipr_value row as `note`. Rendered in muted grey next
  //       to the mm label.
  const { colorInstructions, iprMap, iprNotes } = useMemo(() => {
    const colors: ToothInstruction[] = [];
    const ipr = new Map<number, string>();
    const notes = new Map<number, string>();
    for (const { toothNumber, entries } of review.odontogram ?? []) {
      for (const e of entries) {
        if (e.type === 'ipr_value') {
          if (e.value) ipr.set(toothNumber, e.value);
          if (e.note) notes.set(toothNumber, e.note);
        } else if (
          e.type === ToothInstructionType.NO_ATTACHMENTS ||
          e.type === ToothInstructionType.DO_NOT_MOVE ||
          e.type === ToothInstructionType.NO_IPR ||
          e.type === ToothInstructionType.EXTRACT
        ) {
          colors.push({ toothNumber, type: e.type as ToothInstructionType });
        }
      }
    }
    return { colorInstructions: colors, iprMap: ipr, iprNotes: notes };
  }, [review.odontogram]);

  // Default the toggle based on what data the plan already has — if an image
  // was uploaded, show the image tab; otherwise show per-tooth.
  const [iprMode, setIprMode] = useState<IprMode>(() =>
    review.movementTableImagePath ? 'image' : 'per-tooth',
  );

  const persistInstructions = useCallback(
    (
      colors: ToothInstruction[],
      ipr: Map<number, string>,
      notes: Map<number, string>,
    ) => {
      // Build the final ipr_value rows by merging the two maps on tooth
      // number. A slot is persisted whenever it has EITHER an mm value
      // OR a stripping note — clearing the IPR amount but keeping the
      // note (or vice versa) is a legal state.
      const iprKeys = new Set<number>([...ipr.keys(), ...notes.keys()]);
      const iprRows: ToothInstruction[] = [];
      for (const toothNumber of iprKeys) {
        const value = ipr.get(toothNumber)?.trim();
        const note = notes.get(toothNumber)?.trim();
        if (!value && !note) continue;
        iprRows.push({
          toothNumber,
          type: ToothInstructionType.IPR_VALUE,
          value: value && value.length > 0 ? value : null,
          note: note && note.length > 0 ? note : null,
        });
      }
      updateInstructions.mutate({
        id: review.orderId,
        instructions: [...colors, ...iprRows],
      });
    },
    [review.orderId, updateInstructions],
  );

  const handleColorChange = (next: ToothInstruction[]) => {
    // Color instructions changed via OdontogramSelector — persist immediately,
    // preserving the current IPR set + stripping notes.
    persistInstructions(next, iprMap, iprNotes);
  };

  const handleIprChange = (toothNumber: number, value: string | null) => {
    const next = new Map(iprMap);
    if (value === null || value.trim().length === 0) next.delete(toothNumber);
    else next.set(toothNumber, value.trim());
    persistInstructions(colorInstructions, next, iprNotes);
  };

  const handleIprNoteChange = (toothNumber: number, note: string | null) => {
    const next = new Map(iprNotes);
    if (note === null || note.trim().length === 0) next.delete(toothNumber);
    else next.set(toothNumber, note.trim());
    persistInstructions(colorInstructions, iprMap, next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          {/* Renamed from "Orthodontic Tooth Movement & IPR". In the
              treatment-plan editor the planner only places attachments
              and IPR — the doctor's movement instructions live on the
              order itself, not on the plan. */}
          Attachments &amp; IPR
        </CardTitle>
        {canEdit && (
          <IprModeToggle value={iprMode} onChange={setIprMode} />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── 2a · Interactive odontogram in 'attachments' mode.
                  • Tooth picker collapses to a single attachment colour —
                    the planner just marks which teeth carry an attachment.
                  • IPR layer is ALWAYS displayed (so the doctor sees the
                    purple bars between teeth regardless of editor mode);
                    edits are gated by canEdit + per-tooth IPR mode.
                  • Stripping notes are wired through iprNotes /
                    onIprNoteChange — the IPR popover surfaces a second
                    input only when the setter is present. */}
        <OdontogramSelector
          mode="attachments"
          value={colorInstructions}
          onChange={handleColorChange}
          disabled={!canEdit || updateInstructions.isPending}
          iprValues={iprMap}
          iprNotes={iprNotes}
          onIprChange={
            iprMode === 'per-tooth' && canEdit ? handleIprChange : undefined
          }
          onIprNoteChange={
            iprMode === 'per-tooth' && canEdit
              ? handleIprNoteChange
              : undefined
          }
        />

        {/* Editor instructions — only relevant when the planner is in
            per-tooth mode and can actually click slots. */}
        {iprMode === 'per-tooth' && canEdit && (
          <div className="rounded-md border bg-purple-50/40 p-3 text-xs text-purple-900">
            <p className="font-semibold">Per-tooth IPR</p>
            <p className="text-purple-900/80">
              Click the dotted vertical line between any two teeth to add an
              IPR amount (in millimetres). A purple bar with the value will
              appear at the slot.
            </p>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="IPR reference image"
                    className="block max-h-[480px] w-full object-contain"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFullView(true)}
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

        {fullView && imageUrl && (
          <Dialog open onOpenChange={() => setFullView(false)}>
            <DialogContent
              className="max-h-[95vh] w-[min(96vw,1400px)] max-w-none overflow-auto p-2 sm:p-4"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">IPR Reference Image</DialogTitle>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullView(false)}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="IPR reference image — full size"
                className="block h-auto w-full object-contain"
              />
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
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
