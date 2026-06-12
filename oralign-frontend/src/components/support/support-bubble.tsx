'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import {
  ChevronLeft,
  ImageIcon,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import { supportAttachmentUrl } from '@/lib/api/support.service';
import {
  useAuthedImage,
  useCreateSupportConversation,
  useMarkSupportRead,
  useSendSupportMessage,
  useSupportConversation,
  useSupportConversations,
  useSupportSocket,
  useSupportUnreadCount,
} from '@/lib/hooks';
import {
  SupportConversationStatus,
  UserRole,
  type SupportConversation,
} from '@/lib/types';
import { toast } from 'sonner';

// Image upload guard rails — match backend exactly so we fail fast
// before a 400 round trip.
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/jpg',
]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Translator signature as exposed by `useT()`. Module-level helpers
 * (e.g. `validateAttachment`) can't call hooks, so components resolve
 * `t` once and pass it down (labelKey pattern).
 */
type Tr = (path: string, vars?: Record<string, string | number>) => string;

/**
 * Floating "Need help?" bubble shown on every dashboard page for
 * dentist accounts. Click → opens a Sheet with either:
 *   • the conversation list (when 0 or 2+ threads exist), or
 *   • the most-recent thread directly (when exactly 1 exists), or
 *   • a "start a new conversation" form (when 0 exist).
 *
 * Real-time updates via /support-chat socket; falls back to a 20s
 * unread-count poll for the badge if the socket is offline.
 */
export function SupportBubble() {
  const { t } = useT();
  const { user, isAuthenticated } = useAuth();
  const isDoctor = user?.role === UserRole.DENTIST;

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const unreadQuery = useSupportUnreadCount(isAuthenticated && isDoctor);
  const unread = unreadQuery.data ?? 0;

  // Always-on socket so the badge updates even while the bubble is
  // closed. The hook is idempotent; per-conversation rooms are
  // joined separately by the active-thread view below.
  useSupportSocket({
    enabled: isAuthenticated && isDoctor,
  });

  if (!isAuthenticated || !isDoctor) return null;

  return (
    <>
      {/* Floating launcher — fixed bottom-right, ~64px circle, with
          a red unread badge. Hidden while the sheet is open so the
          bubble doesn't peek through the overlay on viewports where
          the sheet doesn't go edge-to-edge. */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            unread > 0
              ? t('supportChat.launcherAriaUnread', { count: unread })
              : t('supportChat.launcherAria')
          }
          className={cn(
            'group fixed bottom-4 right-4 z-40 grid size-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:bg-foreground/90 hover:shadow-xl sm:bottom-6 sm:right-6 sm:size-16',
          )}
        >
          <MessageCircle className="size-6 transition-transform group-hover:scale-110 sm:size-7" />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-white ring-2 ring-background"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          // Mobile: edge-to-edge. ≥sm: 420px column with a soft
          // shadow. p-0 because every internal section sets its own
          // padding (header / list / composer).
          //
          // `showCloseButton={false}` — every header inside this sheet
          // (ConversationList / NewConversationForm / ActiveThread)
          // renders its own context-aware close button (paired with a
          // back chevron on sub-views). The default sheet X would
          // double up with ours, which is the "two X" bug visible in
          // the screenshot.
          showCloseButton={false}
          className="flex w-full max-w-full flex-col gap-0 p-0 sm:max-w-[420px]"
        >
          <SupportSheetBody
            open={open}
            activeId={activeId}
            setActiveId={setActiveId}
            onClose={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sheet body — toggles between conversation list and active thread

function SupportSheetBody({
  open,
  activeId,
  setActiveId,
  onClose,
}: {
  open: boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onClose: () => void;
}) {
  const listQuery = useSupportConversations(
    { page: 1, limit: 20 },
    open,
  );
  const items = listQuery.data?.data ?? [];

  // Auto-select the most recent thread on first open (one-shot).
  const selectedOnce = useRef(false);
  useEffect(() => {
    if (!open) {
      selectedOnce.current = false;
      return;
    }
    if (selectedOnce.current) return;
    if (!activeId && items.length > 0) {
      setActiveId(items[0].id);
      selectedOnce.current = true;
    }
  }, [open, items, activeId, setActiveId]);

  if (activeId) {
    return (
      <ActiveThread
        conversationId={activeId}
        onBack={() => setActiveId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <ConversationList
      isLoading={listQuery.isLoading}
      items={items}
      onPick={(id) => setActiveId(id)}
      onClose={onClose}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Conversation list (doctor side) — only shown when 0 threads OR >1
// threads exist. Single-thread accounts skip straight to the chat.

function ConversationList({
  isLoading,
  items,
  onPick,
  onClose,
}: {
  isLoading: boolean;
  items: SupportConversation[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const [composeOpen, setComposeOpen] = useState(false);
  if (composeOpen) {
    return <NewConversationForm onDone={onPick} onCancel={() => setComposeOpen(false)} />;
  }
  return (
    <>
      <SheetHeader className="flex flex-row items-center justify-between border-b p-4">
        <SheetTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-5 text-primary" />
          {t('supportChat.title')}
        </SheetTitle>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label={t('supportChat.closePanelAria')}
        >
          <X className="size-4" />
        </Button>
      </SheetHeader>
      <div className="border-b p-3">
        <Button
          onClick={() => setComposeOpen(true)}
          className="w-full gap-2"
        >
          <Plus className="size-4" />
          {t('supportChat.startNew')}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-8 opacity-40" />
            <p className="font-medium text-foreground">
              {t('supportChat.emptyTitle')}
            </p>
            <p className="text-xs">
              {t('supportChat.emptyHintPrefix')}
              <strong>{t('supportChat.startNew')}</strong>
              {t('supportChat.emptyHintSuffix')}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.subject ||
                        c.lastMessagePreview ||
                        t('supportChat.threadFallback')}
                    </span>
                    {c.unreadByDoctor > 0 ? (
                      <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                        {c.unreadByDoctor}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {c.lastMessagePreview ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {format(
                      new Date(c.lastMessageAt),
                      lang === 'fr' ? 'd MMM, HH:mm' : 'MMM d, HH:mm',
                      { locale: lang === 'fr' ? frLocale : undefined },
                    )}{' '}
                    · {t(`supportChat.status.${c.status}`)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// New conversation form

function NewConversationForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const create = useCreateSupportConversation();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!body.trim() && !file) {
      toast.error(t('supportChat.toastEmpty'));
      return;
    }
    create.mutate(
      {
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        attachment: file ?? undefined,
      },
      {
        onSuccess: (data) => {
          onDone(data.conversation.id);
        },
      },
    );
  };

  return (
    <>
      <SheetHeader className="flex flex-row items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onCancel}
            aria-label={t('common.back')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <SheetTitle className="text-base">
            {t('supportChat.newConvTitle')}
          </SheetTitle>
        </div>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('supportChat.subjectLabel')}
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('supportChat.subjectPlaceholder')}
            maxLength={160}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('supportChat.describeLabel')}
          </label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder={t('supportChat.describePlaceholder')}
            className="resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            {t('supportChat.tip')}
          </p>
        </div>
        <AttachmentRow file={file} onChange={setFile} fileRef={fileRef} />
      </div>
      <div className="border-t bg-background p-3">
        <Button
          onClick={submit}
          disabled={create.isPending || (!body.trim() && !file)}
          className="w-full gap-2"
          size="lg"
        >
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {t('supportChat.sendToSupport')}
        </Button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Active thread (doctor side)

function ActiveThread({
  conversationId,
  onBack,
  onClose,
}: {
  conversationId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const { data, isLoading } = useSupportConversation(conversationId);
  const sendMessage = useSendSupportMessage();
  const markRead = useMarkSupportRead();
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Single shared lightbox for the whole thread — clicking any image
  // bubble sets this to that message, and the lightbox renders a fresh
  // (already-cached) blob URL. Keeping it at the thread level means
  // ONE Dialog instance in the DOM no matter how many images load.
  const [lightboxMessage, setLightboxMessage] = useState<{
    conversationId: string;
    id: string;
    attachmentName?: string | null;
  } | null>(null);
  // Full view asks for the `lg` optimized variant — the backend falls
  // back to the original automatically when the variant isn't ready.
  const lightboxUrl = lightboxMessage
    ? supportAttachmentUrl(lightboxMessage.conversationId, lightboxMessage.id) +
      '?variant=lg'
    : null;
  const lightboxImg = useAuthedImage(lightboxUrl);

  // Real-time updates for this thread + handle remote deletion.
  useSupportSocket({
    conversationId,
    onConversationDeleted: (id) => {
      if (id === conversationId) setDeletedNotice(true);
    },
  });

  // Mark-read whenever this thread becomes visible OR new messages
  // land while it's open.
  useEffect(() => {
    if (data?.conversation?.id && (data.conversation.unreadByDoctor ?? 0) > 0) {
      markRead.mutate(data.conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.conversation?.id, data?.messages?.length]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);

  const closed =
    data?.conversation.status === SupportConversationStatus.CLOSED ||
    !!data?.conversation.deletedAt ||
    deletedNotice;

  const submit = () => {
    if (!body.trim() && !file) return;
    sendMessage.mutate(
      {
        conversationId,
        body: body.trim() || undefined,
        attachment: file ?? undefined,
      },
      {
        onSuccess: () => {
          setBody('');
          setFile(null);
          if (fileRef.current) fileRef.current.value = '';
        },
      },
    );
  };

  if (deletedNotice) {
    return (
      <>
        <SheetHeader className="flex flex-row items-center justify-between border-b p-4">
          <SheetTitle className="text-base">{t('supportChat.title')}</SheetTitle>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </SheetHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {t('supportChat.deletedNotice')}
          </p>
          <Button variant="outline" onClick={onBack}>
            {t('supportChat.backToList')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader className="flex flex-row items-center justify-between border-b p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <SheetTitle className="truncate text-sm">
              {data?.conversation.subject ?? t('supportChat.threadFallback')}
            </SheetTitle>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('supportChat.statusLine', {
                status: data?.conversation.status
                  ? t(`supportChat.status.${data.conversation.status}`)
                  : '…',
              })}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </SheetHeader>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3"
      >
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 self-end" />
          </>
        ) : (
          (data?.messages ?? []).map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              fromMe={m.senderRole === UserRole.DENTIST}
              onOpenImage={() =>
                setLightboxMessage({
                  conversationId: m.conversationId,
                  id: m.id,
                  attachmentName: m.attachmentName,
                })
              }
            />
          ))
        )}
      </div>
      {closed ? (
        <div className="border-t bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          {t('supportChat.closedNotice')}
        </div>
      ) : (
        <Composer
          body={body}
          onBodyChange={setBody}
          file={file}
          onFileChange={setFile}
          fileRef={fileRef}
          onSubmit={submit}
          pending={sendMessage.isPending}
          placeholder={t('supportChat.composerPlaceholder')}
        />
      )}
      <ImageLightbox
        open={!!lightboxMessage}
        onOpenChange={(open) => {
          if (!open) setLightboxMessage(null);
        }}
        src={lightboxImg.src}
        alt={lightboxMessage?.attachmentName ?? t('supportChat.attachmentFallback')}
        caption={lightboxMessage?.attachmentName ?? undefined}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Composer — single-row, responsive, Messenger-style.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────┐
//   │ 📎 [        textarea grows to fill the row        ] ▶  │
//   └──────────────────────────────────────────────────────────┘
//                       attachment chip (above)
//
// The attach button is an icon-only ghost button on the left so the
// composer reads as ONE input (the Messenger pattern). The pending
// attachment renders above the row as a dismissable chip so the
// user always sees what's queued to send. Textarea uses `flex-1` +
// `max-h-32` with auto-scroll so a long draft doesn't push the
// send button off-screen.

/**
 * Shared image-attachment validator. Centralised so the file-picker,
 * the paste handler, and any future drag-drop path all go through the
 * same guard rails (MIME whitelist + 10 MB cap) before touching state.
 *
 * Returns the file when it passes, `null` when it's rejected (and
 * surfaces a toast in that case so the caller doesn't have to).
 */
function validateAttachment(f: File | null, t: Tr): File | null {
  if (!f) return null;
  if (!ALLOWED_MIME.has(f.type)) {
    toast.error(t('supportChat.toastBadType'));
    return null;
  }
  if (f.size > MAX_BYTES) {
    toast.error(t('supportChat.toastTooLarge'));
    return null;
  }
  return f;
}

export function Composer({
  body,
  onBodyChange,
  file,
  onFileChange,
  fileRef,
  onSubmit,
  pending,
  placeholder,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
}) {
  const { t } = useT();
  const onPickFile = (f: File | null) => {
    if (!f) {
      onFileChange(null);
      return;
    }
    const ok = validateAttachment(f, t);
    if (!ok) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    onFileChange(ok);
  };

  /**
   * Paste-from-clipboard handler. When the user presses Ctrl/Cmd+V
   * inside the textarea (or right-click → Paste), the browser fires a
   * `paste` event with all clipboard MIME parts attached to
   * `clipboardData.items`. We scan for the first image part, convert
   * it to a File (synthesising a filename — clipboard images come
   * with no name), and route it through the same validator the
   * picker uses. Calling `preventDefault` keeps the binary garbage
   * from being pasted into the textarea as text.
   */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        // Synthesise a friendly filename — Windows clipboard images
        // arrive as `image.png` from getAsFile() but on some browsers
        // the name is empty. Fall back to `pasted-image.<ext>`.
        const ext = blob.type.split('/')[1] || 'png';
        const filename =
          blob.name && blob.name !== 'image.png'
            ? blob.name
            : `pasted-image-${Date.now()}.${ext}`;
        const fileFromPaste = new File([blob], filename, { type: blob.type });
        const ok = validateAttachment(fileFromPaste, t);
        if (!ok) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onFileChange(ok);
        toast.success(t('supportChat.toastPasted'));
        return;
      }
    }
    // No image in clipboard → let the textarea handle the paste as
    // normal text. Don't preventDefault.
  };

  const disabled = pending || (!body.trim() && !file);

  return (
    <div className="border-t bg-background p-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      {/* Attachment preview — appears above the input row so the
          user always sees what's queued. Click the × to drop it. */}
      {file ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
          <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={() => onPickFile(null)}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label={t('supportChat.removeAttachment')}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}

      {/* The composer ROW — attach (left) + textarea (grows) + send
          (right). `flex items-end` keeps the buttons pinned to the
          bottom so they don't jump as the textarea grows. */}
      <div className="flex items-end gap-1.5 rounded-2xl border bg-background px-1 py-1 focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-foreground/10">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t('supportChat.attachScreenshot')}
          title={t('supportChat.attachTitle')}
        >
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onPaste={onPaste}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          // flex-1 makes the textarea fill all leftover row space.
          // min-h-9 matches the buttons; max-h-32 keeps long drafts
          // from pushing the send off-screen — overflow scrolls
          // internally instead.
          className="min-h-9 max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          onClick={onSubmit}
          disabled={disabled}
          className={cn(
            'size-9 shrink-0 rounded-xl transition-transform',
            !disabled && 'hover:scale-105',
          )}
          aria-label={t('supportChat.sendMessageAria')}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
        <kbd className="rounded border bg-muted px-1 text-[10px]">Enter</kbd>{' '}
        {t('supportChat.kbdSend')} ·{' '}
        <kbd className="rounded border bg-muted px-1 text-[10px]">Shift+Enter</kbd>{' '}
        {t('supportChat.kbdNewline')} ·{' '}
        <kbd className="rounded border bg-muted px-1 text-[10px]">Ctrl+V</kbd>{' '}
        {t('supportChat.kbdPaste')}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared sub-components

export function AttachmentRow({
  file,
  onChange,
  fileRef,
  compact,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  compact?: boolean;
}) {
  const { t } = useT();
  const onPick = (f: File | null) => {
    if (!f) {
      onChange(null);
      return;
    }
    if (!ALLOWED_MIME.has(f.type)) {
      toast.error(t('supportChat.toastBadType'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(t('supportChat.toastTooLarge'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    onChange(f);
  };
  return (
    <div className={cn('space-y-1.5', compact ? 'mb-2' : '')}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
          <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label={t('supportChat.removeAttachment')}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="h-8 gap-2"
        >
          <Paperclip className="size-3.5" />
          {t('supportChat.attachScreenshot')}
        </Button>
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  fromMe,
  onOpenImage,
}: {
  message: {
    id: string;
    conversationId: string;
    body?: string | null;
    attachmentRelativePath?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
    createdAt: string;
    readAt?: string | null;
  };
  fromMe: boolean;
  /**
   * Fires when the user clicks the attachment thumbnail. The parent
   * thread owns the lightbox so all message bubbles share ONE viewer
   * (no per-message Dialog DOM nodes).
   */
  onOpenImage?: () => void;
}) {
  const { t } = useT();
  // The attachment route is JWT-guarded, so a plain `<img src={URL}>`
  // returns 401 — the browser doesn't attach Authorization headers
  // for resource loads. Fetch via the authed axios client and render
  // the resulting blob URL instead. The inline bubble only needs the
  // `thumb` optimized variant (server falls back to the original when
  // the variant isn't generated yet, so this is always safe).
  const attachmentApiUrl = useMemo(
    () =>
      message.attachmentRelativePath
        ? supportAttachmentUrl(message.conversationId, message.id) +
          '?variant=thumb'
        : null,
    [message.conversationId, message.id, message.attachmentRelativePath],
  );
  const { src: attachmentSrc, loading: attachmentLoading } =
    useAuthedImage(attachmentApiUrl);

  return (
    <div className={cn('flex flex-col', fromMe ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 shadow-sm',
          fromMe
            ? 'rounded-br-sm bg-foreground text-background'
            : 'rounded-bl-sm border bg-background text-foreground',
        )}
      >
        {attachmentApiUrl ? (
          <button
            type="button"
            onClick={onOpenImage}
            disabled={!attachmentSrc}
            aria-label={t('supportChat.openImageAria', {
              name: message.attachmentName ?? t('supportChat.attachmentFallback'),
            })}
            className="mb-1 block overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {attachmentLoading ? (
              <Skeleton className="h-48 w-64" />
            ) : attachmentSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentSrc}
                alt={message.attachmentName ?? t('supportChat.attachmentFallback')}
                loading="lazy"
                decoding="async"
                className="max-h-60 w-auto max-w-full cursor-zoom-in rounded-md object-contain"
              />
            ) : (
              <div className="grid h-32 w-48 place-items-center rounded-md bg-muted/40 text-xs text-muted-foreground">
                {t('supportChat.imageError')}
              </div>
            )}
          </button>
        ) : null}
        {message.body ? (
          <p className="whitespace-pre-wrap text-sm leading-snug">{message.body}</p>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {format(new Date(message.createdAt), 'HH:mm')}
        {fromMe && message.readAt ? ` · ${t('supportChat.readReceipt')}` : null}
      </p>
    </div>
  );
}
