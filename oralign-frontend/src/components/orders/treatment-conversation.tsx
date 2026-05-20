'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import {
  CheckCheck,
  Download,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useSendTreatmentMessage } from '@/lib/hooks/use-treatment-plans';
import {
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  UserRole,
  type TreatmentMessage,
} from '@/lib/types';

interface Props {
  /** Order id — the conversation is order-scoped (one thread shared across
   *  every plan version). */
  orderId: string;
  /** Latest plan id — new messages get attached to this plan on the
   *  server side. */
  activePlanId: string;
  messages: TreatmentMessage[];
  role: UserRole;
  /** Current user's id — used to align bubbles right (own) vs left (theirs). */
  currentUserId: string;
  /** Live-connection state from the parent's socket subscription. The
   *  socket itself is owned by the order-level TreatmentPlansSection so
   *  it survives tab switches and shares one connection per order. */
  connected: boolean;
}

/**
 * Messenger-style chat for a single ORDER (one conversation, regardless of
 * which treatment plan version the user has selected).
 *
 * - Bubbles are right-aligned for own messages, left-aligned with avatar
 *   for others, system messages centred.
 * - Consecutive messages from the same sender within 5 min collapse into
 *   a single bubble cluster — same as iMessage / Messenger.
 * - Day separators between calendar days; per-message timestamps shown
 *   only on the last bubble in a cluster.
 * - Attachments render as cards inline under the message text.
 * - Subscribes to an order-scoped websocket room so new messages from the
 *   other side appear in real-time without polling.
 */
export function TreatmentConversation({
  orderId,
  activePlanId,
  messages,
  role,
  currentUserId,
  connected,
}: Props) {
  const send = useSendTreatmentMessage();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<TreatmentAttachmentCategory | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isPlanner =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER;

  // Auto-scroll to the newest message whenever the array changes.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, orderId]);

  /**
   * Pre-compute a flat render list with cluster metadata. Each "cluster"
   * is a run of consecutive messages from the same sender within a short
   * window — only the first bubble of a cluster shows the avatar / name,
   * and only the last shows the timestamp + sent-tick.
   */
  const items = useMemo(() => {
    type Item = {
      message: TreatmentMessage;
      isOwn: boolean;
      isSystem: boolean;
      isFirstOfCluster: boolean;
      isLastOfCluster: boolean;
      showDateSeparator: boolean;
    };
    const out: Item[] = [];
    const CLUSTER_GAP_MS = 5 * 60_000;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const isSystem =
        m.type === TreatmentMessageType.SYSTEM ||
        m.type === TreatmentMessageType.APPROVAL ||
        m.type === TreatmentMessageType.REJECTION;
      const isOwn = !isSystem && m.senderId === currentUserId;
      const showDateSeparator =
        !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));

      const sameAsPrev =
        prev &&
        !isSystem &&
        prev.senderId === m.senderId &&
        m.type === prev.type &&
        new Date(m.createdAt).getTime() -
          new Date(prev.createdAt).getTime() <
          CLUSTER_GAP_MS &&
        !showDateSeparator;
      const sameAsNext =
        next &&
        !isSystem &&
        next.senderId === m.senderId &&
        next.type === m.type &&
        new Date(next.createdAt).getTime() -
          new Date(m.createdAt).getTime() <
          CLUSTER_GAP_MS &&
        isSameDay(new Date(next.createdAt), new Date(m.createdAt));

      out.push({
        message: m,
        isOwn,
        isSystem,
        isFirstOfCluster: !sameAsPrev,
        isLastOfCluster: !sameAsNext,
        showDateSeparator,
      });
    }
    return out;
  }, [messages, currentUserId]);

  const onSend = () => {
    if (!text.trim() && files.length === 0) return;
    // The conversation is order-scoped, but every message physically
    // attaches to a specific plan version (for audit trail). Use the
    // currently-active plan as the anchor.
    send.mutate(
      {
        id: activePlanId,
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
    <div className="flex h-[640px] flex-col overflow-hidden rounded-xl border bg-card">
      {/* Connection chip */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">
          Conversation
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            connected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700',
          )}
          title={connected ? 'Live updates connected' : 'Reconnecting…'}
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Timeline */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-gradient-to-b from-muted/10 to-background px-3 py-4 sm:px-5"
      >
        {items.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((it, i) => (
              <li key={it.message.id}>
                {it.showDateSeparator && <DateSeparator date={it.message.createdAt} />}
                {it.isSystem ? (
                  <SystemRow message={it.message} />
                ) : (
                  <Bubble item={it} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Composer */}
      <div className="border-t bg-background p-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <Badge
                key={`${f.name}-${i}`}
                variant="secondary"
                className="gap-2 py-1.5"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) => current.filter((_, idx) => idx !== i))
                  }
                  className="rounded p-0.5 hover:bg-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
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

          <Textarea
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            className="max-h-32 min-h-[44px] flex-1 resize-none"
            rows={1}
          />

          <Button
            type="button"
            onClick={onSend}
            disabled={
              send.isPending || (!text.trim() && files.length === 0)
            }
            size="icon"
            className="shrink-0"
            title="Send (Enter)"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {isPlanner && files.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Category for attached files:</span>
            <Select
              value={category ?? ''}
              onValueChange={(v) =>
                setCategory(
                  v ? (v as TreatmentAttachmentCategory) : undefined,
                )
              }
            >
              <SelectTrigger className="h-7 w-[200px] text-xs">
                <SelectValue placeholder="Auto-detect" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TreatmentAttachmentCategory).map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Render helpers ────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {format(new Date(date), 'EEE, MMM d')}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function SystemRow({ message }: { message: TreatmentMessage }) {
  return (
    <div className="my-1 flex justify-center">
      <span className="inline-flex max-w-[80%] items-center gap-2 rounded-full bg-amber-100/80 px-3 py-1 text-center text-[11px] font-medium text-amber-800 shadow-sm">
        {message.message}
      </span>
    </div>
  );
}

function Bubble({
  item,
}: {
  item: {
    message: TreatmentMessage;
    isOwn: boolean;
    isFirstOfCluster: boolean;
    isLastOfCluster: boolean;
  };
}) {
  const { message, isOwn, isFirstOfCluster, isLastOfCluster } = item;
  const initials = (message.sender?.fullName ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Rounded-corner asymmetry to make a clustered run look like a single
  // chat balloon — same trick iMessage/Messenger use.
  const bubbleShape = isOwn
    ? cn(
        'bg-primary text-primary-foreground',
        isFirstOfCluster && isLastOfCluster && 'rounded-2xl',
        isFirstOfCluster && !isLastOfCluster && 'rounded-2xl rounded-br-md',
        !isFirstOfCluster && isLastOfCluster && 'rounded-2xl rounded-tr-md',
        !isFirstOfCluster && !isLastOfCluster && 'rounded-2xl rounded-r-md',
      )
    : cn(
        'bg-card text-foreground border',
        isFirstOfCluster && isLastOfCluster && 'rounded-2xl',
        isFirstOfCluster && !isLastOfCluster && 'rounded-2xl rounded-bl-md',
        !isFirstOfCluster && isLastOfCluster && 'rounded-2xl rounded-tl-md',
        !isFirstOfCluster && !isLastOfCluster && 'rounded-2xl rounded-l-md',
      );

  return (
    <div
      className={cn(
        'flex w-full items-end gap-2',
        isOwn ? 'justify-end' : 'justify-start',
        !isFirstOfCluster && 'mt-0.5',
      )}
    >
      {!isOwn && (
        <div className="shrink-0">
          {isLastOfCluster ? (
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="block h-7 w-7" aria-hidden />
          )}
        </div>
      )}

      <div className={cn('flex max-w-[85%] flex-col gap-1', isOwn && 'items-end')}>
        {isFirstOfCluster && !isOwn && (
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {message.sender?.fullName}
            {message.sender?.role && (
              <span className="ml-1.5 text-muted-foreground/70">
                · {message.sender.role.replaceAll('_', ' ')}
              </span>
            )}
          </span>
        )}

        <div className={cn('px-3.5 py-2 shadow-sm', bubbleShape)}>
          {message.message && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.message}
            </p>
          )}
          {message.attachments.length > 0 && (
            <div className={cn('grid gap-2', message.message && 'mt-2')}>
              {message.attachments.map((att) => (
                <a
                  key={att.id}
                  href={treatmentPlansService.attachmentDownloadUrl(att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-2 text-xs transition hover:scale-[1.02]',
                    isOwn
                      ? 'border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20'
                      : 'border-border bg-muted/30 hover:bg-muted/50',
                  )}
                >
                  {att.mimeType?.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 shrink-0" />
                  ) : (
                    <Paperclip className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{att.fileName}</p>
                    <p
                      className={cn(
                        'text-[10px] uppercase tracking-wide',
                        isOwn
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground',
                      )}
                    >
                      {att.category.replaceAll('_', ' ')} ·{' '}
                      {formatBytes(att.sizeBytes ?? 0)}
                    </p>
                  </div>
                  <Download className="h-3.5 w-3.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        {isLastOfCluster && (
          <span className="inline-flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
            {format(new Date(message.createdAt), 'HH:mm')}
            {isOwn && <CheckCheck className="h-3 w-3" />}
          </span>
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
