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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { cn, getAvatarUrl } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import { useSendTreatmentMessage } from '@/lib/hooks/use-treatment-plans';
import { useAuthedImage } from '@/lib/hooks';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import {
  TreatmentAttachmentCategory,
  TreatmentMessageType,
  UserRole,
  type TreatmentMessage,
} from '@/lib/types';
import { toast } from 'sonner';

// Type alias for the attachment shape used inside a chat message. Pulled
// from the TreatmentMessage type so it stays in sync with the API.
type ChatAttachment = TreatmentMessage['attachments'][number];

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
  const { t } = useT();
  const send = useSendTreatmentMessage();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<TreatmentAttachmentCategory | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Lightbox state lifted to the conversation level so the WHOLE thread
  // shares one viewer instead of mounting a Dialog per image bubble.
  // The download endpoint is JWT-guarded — a plain `<img src=>` returns
  // 401 because the browser doesn't attach Authorization headers for
  // resource loads. We fetch through the authed axios client and feed
  // the resulting blob URL to the lightbox + the inline thumbnails.
  const [lightboxAttachment, setLightboxAttachment] = useState<
    ChatAttachment | null
  >(null);
  // Full view asks for the `lg` optimized variant — the backend falls
  // back to the original automatically when the variant isn't ready.
  // (Non-image download chips keep the plain URL so files stay originals.)
  const lightboxApiUrl = lightboxAttachment
    ? treatmentPlansService.attachmentDownloadUrl(lightboxAttachment.id) +
      '?variant=lg'
    : null;
  const lightboxImg = useAuthedImage(lightboxApiUrl);
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
          {t('treatmentChat.conversation')}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            connected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700',
          )}
          title={
            connected
              ? t('treatmentChat.liveConnected')
              : t('treatmentChat.reconnecting')
          }
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? t('treatmentChat.live') : t('treatmentChat.offline')}
        </span>
      </div>

      {/* Timeline */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-gradient-to-b from-muted/10 to-background px-3 py-4 sm:px-5"
      >
        {items.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">
            {t('treatmentChat.emptyState')}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((it) => (
              <li key={it.message.id}>
                {it.showDateSeparator && <DateSeparator date={it.message.createdAt} />}
                {it.isSystem ? (
                  <SystemRow message={it.message} />
                ) : (
                  <Bubble item={it} onOpenImage={setLightboxAttachment} />
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
            title={t('treatmentChat.attachFiles')}
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
            placeholder={t('treatmentChat.messagePlaceholder')}
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
            title={t('treatmentChat.sendTooltip')}
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
            <span>{t('treatmentChat.categoryLabel')}</span>
            <Select
              value={category ?? ''}
              onValueChange={(v) =>
                setCategory(
                  v ? (v as TreatmentAttachmentCategory) : undefined,
                )
              }
            >
              <SelectTrigger className="h-7 w-[200px] text-xs">
                <SelectValue placeholder={t('treatmentChat.autoDetect')} />
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

      {/* Shared lightbox — one viewer for every image bubble in this
          conversation. Fed by the authed-blob URL so the JWT-guarded
          download endpoint isn't bypassed. */}
      <ImageLightbox
        open={!!lightboxAttachment}
        onOpenChange={(open) => {
          if (!open) setLightboxAttachment(null);
        }}
        src={lightboxImg.src}
        alt={lightboxAttachment?.fileName ?? t('treatmentChat.fallbackAttachmentName')}
        caption={lightboxAttachment?.fileName ?? undefined}
        subCaption={
          lightboxAttachment
            ? `${lightboxAttachment.category.replaceAll('_', ' ')} · ${formatBytes(lightboxAttachment.sizeBytes ?? 0)}`
            : undefined
        }
      />
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
  onOpenImage,
}: {
  item: {
    message: TreatmentMessage;
    isOwn: boolean;
    isFirstOfCluster: boolean;
    isLastOfCluster: boolean;
  };
  onOpenImage: (att: ChatAttachment) => void;
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
              {/*
                  AvatarImage is allowed to fail silently — Radix's <Avatar>
                  falls back to <AvatarFallback> when the image can't load
                  or src is empty. We always feed it through getAvatarUrl so
                  the backend-relative path (/uploads/avatars/...) becomes
                  an absolute URL the browser can fetch from the API host.
              */}
              <AvatarImage
                src={getAvatarUrl(message.sender?.avatarUrl)}
                alt={message.sender?.fullName ?? ''}
              />
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
              {message.attachments.map((att) =>
                att.mimeType?.startsWith('image/') ? (
                  <ChatAttachmentImage
                    key={att.id}
                    attachment={att}
                    isOwn={isOwn}
                    onOpen={() => onOpenImage(att)}
                  />
                ) : (
                  <ChatAttachmentLink
                    key={att.id}
                    attachment={att}
                    isOwn={isOwn}
                  />
                ),
              )}
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
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Click-to-download attachment chip with authenticated fetch.
 *
 * Why this exists: the previous version was a plain `<a href={...}>` with
 * `target="_blank"`. The download endpoint is behind the JWT guard, so
 * clicking the anchor sent NO Authorization header — the backend
 * returned 401, the browser silently opened a JSON error page, and the
 * doctor couldn't open any document attached to the conversation. This
 * component does the request through the axios client (which DOES carry
 * the bearer token), turns the response into a `blob:` URL, and opens
 * THAT in a new tab. The URL is revoked after a short delay so the blob
 * doesn't pin memory once the browser has loaded it.
 */
function ChatAttachmentLink({
  attachment,
  isOwn,
}: {
  attachment: ChatAttachment;
  isOwn: boolean;
}) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { blobUrl } = await treatmentPlansService.fetchAttachmentBlobUrl(
        attachment.id,
      );
      // open() can be popup-blocked when called from inside an async
      // continuation. We trade-off accepting that the click handler is
      // the actual user gesture (which most browsers honour) — and
      // fall back to a same-tab navigation if that gets blocked.
      const opened = window.open(blobUrl, '_blank', 'noopener');
      if (!opened) window.location.href = blobUrl;
      // Revoke after a short delay so the new tab definitely had time
      // to fetch the blob. 60 s is plenty; the alternative is leaking
      // the blob for the rest of the page's lifetime.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('treatmentChat.failedToOpenAttachment');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={loading}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2 text-left text-xs transition hover:scale-[1.02] disabled:opacity-60',
        isOwn
          ? 'border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'border-border bg-muted/30 hover:bg-muted/50',
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : attachment.mimeType?.startsWith('image/') ? (
        <ImageIcon className="h-4 w-4 shrink-0" />
      ) : (
        <Paperclip className="h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{attachment.fileName}</p>
        <p
          className={cn(
            'text-[10px] uppercase tracking-wide',
            isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {attachment.category.replaceAll('_', ' ')} ·{' '}
          {formatBytes(attachment.sizeBytes ?? 0)}
        </p>
      </div>
      <Download className="h-3.5 w-3.5 shrink-0" />
    </button>
  );
}

/**
 * Inline image thumbnail rendered directly inside the chat bubble.
 *
 * Why a dedicated component (and not just `<img src={downloadUrl(id)}>`):
 * the download endpoint is JWT-guarded — Passport reads the bearer
 * token from `Authorization: Bearer …` and the browser does NOT
 * attach that header for `<img>` resource loads. The plain tag would
 * return 401 and render a broken image icon. We fetch via the authed
 * axios client (token attached) and feed the resulting `blob:` URL
 * to the `<img>` instead.
 *
 * Click → fires `onOpen()` so the parent conversation's shared
 * lightbox can take over. Single viewer for the whole thread — no
 * per-bubble Dialog DOM nodes.
 */
function ChatAttachmentImage({
  attachment,
  isOwn,
  onOpen,
}: {
  attachment: ChatAttachment;
  isOwn: boolean;
  onOpen: () => void;
}) {
  const { t } = useT();
  // The inline bubble only needs the `thumb` optimized variant (server
  // falls back to the original when the variant isn't generated yet).
  const apiUrl =
    treatmentPlansService.attachmentDownloadUrl(attachment.id) +
    '?variant=thumb';
  const { src, loading } = useAuthedImage(apiUrl);

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!src}
      aria-label={t('treatmentChat.openInFullView', { name: attachment.fileName })}
      className={cn(
        'group relative block overflow-hidden rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        isOwn ? 'border-primary-foreground/30' : 'border-border',
      )}
    >
      {loading ? (
        <div className="grid h-40 w-56 animate-pulse place-items-center bg-muted/40">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.fileName}
          className="block max-h-60 w-auto max-w-full cursor-zoom-in object-contain transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <div className="grid h-32 w-48 place-items-center bg-muted/40 text-[11px] text-muted-foreground">
          {t('treatmentChat.couldNotLoadImage')}
        </div>
      )}
      {/* File-name strip — keeps the chat looking like Messenger while
          still telling the user what they're about to open. */}
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 block truncate bg-gradient-to-t from-black/55 to-transparent px-2 py-1 text-left text-[10px] text-white',
        )}
      >
        {attachment.fileName} ·{' '}
        {attachment.category.replaceAll('_', ' ')}
      </span>
    </button>
  );
}
