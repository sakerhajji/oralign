'use client';

import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  Paperclip,
  Send,
  ShieldAlert,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import {
  useApproveTreatmentPlan,
  useDeleteMovementTableImage,
  useGeneratePublicLink,
  useRejectTreatmentPlan,
  useSendTreatmentMessage,
  useTreatmentPlanReview,
  useUpdateResultViewUrl,
  useUploadMovementTableImage,
} from '@/lib/hooks/use-treatment-plans';
import {
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  TreatmentPlanStatus,
  UserRole,
} from '@/lib/types';

interface Props {
  treatmentPlanId: string;
  /** Current user's role — used for client-side affordances only. The
   *  backend re-enforces every action. */
  role: UserRole;
}

/**
 * The doctor / admin / designer review screen for a single Treatment Plan.
 *
 * Layout (spec):
 *   1. Treatment Viewer
 *   2. Movement Table / Odontogram
 *   3. Conversation / Chat
 */
export function TreatmentPlanReview({ treatmentPlanId, role }: Props) {
  const reviewQuery = useTreatmentPlanReview(treatmentPlanId);
  const review = reviewQuery.data;

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

  return (
    <div className="space-y-6">
      <PlanHeader review={review} role={role} />

      <TreatmentViewerCard review={review} canEdit={isPlanner} />

      <MovementTableSection
        review={review}
        canEdit={isPlanner}
        treatmentPlanId={treatmentPlanId}
      />

      <TreatmentConversation
        review={review}
        role={role}
        treatmentPlanId={treatmentPlanId}
      />

      {(isDoctor || isPlanner) && review.status !== TreatmentPlanStatus.APPROVED && (
        <ApprovalActions review={review} />
      )}
    </div>
  );
}

// ─── Header (title + status + public-link generator) ────────────────────────

function PlanHeader({
  review,
  role,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  role: UserRole;
}) {
  const generate = useGeneratePublicLink();
  const isPlanner =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER;

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

        {isPlanner && (
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
              >
                <Link2 className="h-4 w-4" />
                Copy public link
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
              {review.publicToken ? 'Rotate link' : 'Generate public link'}
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
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  canEdit: boolean;
}) {
  const [url, setUrl] = useState(review.resultViewUrl ?? '');
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const updateUrl = useUpdateResultViewUrl();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" />
          Treatment Viewer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {review.resultViewUrl ? (
          <>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
              {!iframeBlocked ? (
                <iframe
                  key={review.resultViewUrl}
                  src={review.resultViewUrl}
                  title="Treatment Viewer"
                  className="absolute inset-0 h-full w-full"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                  onError={() => setIframeBlocked(true)}
                />
              ) : (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                  The viewer cannot be embedded. Open it in a new tab.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="default" size="sm">
                <a
                  href={review.resultViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in full view
                </a>
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Treatment viewer is not available yet.
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center">
            <Input
              type="url"
              placeholder="https://viewer.example.com/cases/abc"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() =>
                url &&
                updateUrl.mutate({
                  id: review.id,
                  resultViewUrl: url.trim(),
                })
              }
              disabled={!url.trim() || updateUrl.isPending}
              className="gap-2"
            >
              {updateUrl.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save viewer URL
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 2 · Movement Table / Odontogram ────────────────────────────────────────

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullView, setFullView] = useState(false);

  const imageUrl = useMemo(
    () =>
      review.movementTableImagePath
        ? `${treatmentPlansService.movementTableImageUrl(treatmentPlanId)}?t=${review.updatedAt}`
        : null,
    [review.movementTableImagePath, review.updatedAt, treatmentPlanId],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          Orthodontic Tooth Movement Table
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {imageUrl ? (
          <>
            <div className="w-full overflow-x-auto rounded-lg border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Orthodontic tooth movement table"
                className="block max-h-[720px] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
              {canEdit && (
                <>
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
                    Replace image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove.mutate(treatmentPlanId)}
                    disabled={remove.isPending}
                    className="gap-2 text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <OdontogramFallback review={review} />
        )}

        {canEdit && !imageUrl && (
          <div className="rounded-md border border-dashed p-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Upload the orthodontic tooth movement table image.
            </p>
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
              Upload movement table
            </Button>
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
            if (file)
              upload.mutate({ id: treatmentPlanId, file });
          }}
        />

        {fullView && imageUrl && (
          <Dialog open onOpenChange={() => setFullView(false)}>
            <DialogContent
              className="max-h-[95vh] w-[min(96vw,1400px)] max-w-none overflow-auto p-2 sm:p-4"
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">Movement Table</DialogTitle>
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
                alt="Movement table — full size"
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
 * Minimal IPR-aware odontogram fallback shown when no movement-table image
 * has been uploaded. Displays each tooth that has a planner-added value
 * (especially ipr_value entries) in a wide, horizontally-scrollable strip.
 */
function OdontogramFallback({
  review,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
}) {
  const teeth = review.odontogram ?? [];
  if (teeth.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No movement table image or per-tooth IPR values have been added yet.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border bg-card">
      <div className="flex min-w-max items-end gap-2 p-4">
        {teeth.map(({ toothNumber, entries }) => {
          const iprEntry = entries.find((e) => e.type === 'ipr_value');
          const flags = entries.filter((e) => e.type !== 'ipr_value');
          return (
            <div
              key={toothNumber}
              className="grid w-16 shrink-0 place-items-center gap-1 rounded-md border bg-background p-2 text-center"
            >
              <span className="text-xs font-semibold text-foreground">
                {toothNumber}
              </span>
              {iprEntry && (
                <Badge className="bg-primary text-primary-foreground">
                  IPR {iprEntry.value ?? '?'}
                </Badge>
              )}
              {flags.map((f, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] uppercase"
                  title={f.note ?? ''}
                >
                  {shortLabel(f.type)}
                </Badge>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortLabel(type: string): string {
  switch (type) {
    case 'no_attachments':
      return 'NA';
    case 'do_not_move':
      return 'DNM';
    case 'no_ipr':
      return 'NoIPR';
    case 'extract':
      return 'EXT';
    default:
      return type;
  }
}

// ─── 3 · Treatment Conversation / Chat ──────────────────────────────────────

function TreatmentConversation({
  review,
  role,
  treatmentPlanId,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
  role: UserRole;
  treatmentPlanId: string;
}) {
  const send = useSendTreatmentMessage();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<TreatmentAttachmentCategory | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPlanner =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER;

  const onSend = () => {
    if (!text.trim() && files.length === 0) return;
    send.mutate(
      {
        id: treatmentPlanId,
        message: text.trim() || undefined,
        files: files.length > 0 ? files : undefined,
        category,
      },
      {
        onSuccess: () => {
          setText('');
          setFiles([]);
          setCategory(undefined);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          Treatment Conversation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Message timeline */}
        <div className="max-h-[480px] space-y-3 overflow-y-auto rounded-md border bg-muted/10 p-3">
          {review.messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Start the conversation below.
            </p>
          ) : (
            review.messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))
          )}
        </div>

        {/* Composer */}
        <div className="space-y-3 rounded-md border bg-background p-3">
          <Textarea
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[80px] resize-y"
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <Badge
                  key={`${f.name}-${i}`}
                  variant="secondary"
                  className="gap-2 py-1.5"
                >
                  <Paperclip className="h-3 w-3" />
                  {f.name}
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) => current.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Paperclip className="h-4 w-4" />
                Attach files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  e.currentTarget.value = '';
                  if (list.length > 0)
                    setFiles((current) => [...current, ...list]);
                }}
              />
              {isPlanner && files.length > 0 && (
                <Select
                  value={category ?? ''}
                  onValueChange={(v) =>
                    setCategory(
                      v ? (v as TreatmentAttachmentCategory) : undefined,
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="Auto-detect category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TreatmentAttachmentCategory).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              type="button"
              onClick={onSend}
              disabled={
                send.isPending || (!text.trim() && files.length === 0)
              }
              className="gap-2"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageRow({
  message,
}: {
  message: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>['messages'][number];
}) {
  const isSystem =
    message.type === TreatmentMessageType.SYSTEM ||
    message.type === TreatmentMessageType.APPROVAL ||
    message.type === TreatmentMessageType.REJECTION;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-md p-2',
        isSystem && 'bg-amber-50 dark:bg-amber-950/30',
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {(message.sender?.fullName ?? '?')
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {message.sender?.fullName ?? 'User'}
          </span>
          {message.sender?.role && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {message.sender.role.replaceAll('_', ' ')}
            </Badge>
          )}
          {isSystem && (
            <Badge variant="outline" className="border-amber-400 bg-amber-100 text-[10px] uppercase">
              system
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground">
            {format(new Date(message.createdAt), 'MMM d, HH:mm')}
          </span>
        </div>
        {message.message && (
          <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
        )}
        {message.attachments.length > 0 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={treatmentPlansService.attachmentDownloadUrl(att.id)}
                className="flex items-center gap-3 rounded-md border bg-background p-2 text-xs hover:border-primary"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{att.fileName}</p>
                  <p className="text-muted-foreground">
                    {att.category} · {formatBytes(att.sizeBytes ?? 0)}
                  </p>
                </div>
                <Download className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Approve / Reject ──────────────────────────────────────────────────────

function ApprovalActions({
  review,
}: {
  review: NonNullable<ReturnType<typeof useTreatmentPlanReview>['data']>;
}) {
  const approve = useApproveTreatmentPlan();
  const reject = useRejectTreatmentPlan();

  if (review.status !== TreatmentPlanStatus.READY) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          The plan must be marked Ready by the designer before it can be
          approved or rejected.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => reject.mutate(review.id)}
          disabled={reject.isPending}
          className="gap-2 text-red-600"
        >
          {reject.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          Reject — request replanning
        </Button>
        <Button
          type="button"
          onClick={() => approve.mutate(review.id)}
          disabled={approve.isPending}
          className="gap-2"
        >
          {approve.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve treatment plan
        </Button>
      </CardContent>
    </Card>
  );
}
