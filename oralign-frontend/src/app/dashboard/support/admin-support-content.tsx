'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Search,
  Send,
  Stethoscope,
  Trash2,
  UserCircle2,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, getAvatarUrl } from '@/lib/utils';
import { supportAttachmentUrl } from '@/lib/api/support.service';
import {
  useAuthedImage,
  useDeleteSupportConversation,
  useMarkSupportRead,
  useRestoreSupportConversation,
  useSendSupportMessage,
  useSupportConversation,
  useSupportConversations,
  useSupportSocket,
  useUpdateSupportPriority,
  useUpdateSupportStatus,
} from '@/lib/hooks';
import {
  SupportConversationStatus,
  SupportPriority,
  UserRole,
  type SupportConversation,
  type SupportMessage,
} from '@/lib/types';
import { Composer } from '@/components/support/support-bubble';

// ─────────────────────────────────────────────────────────────────────
// Constants

const STATUS_OPTIONS: Array<{
  key: SupportConversationStatus | 'all' | 'unread' | 'trash';
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: SupportConversationStatus.OPEN, label: 'Open' },
  { key: SupportConversationStatus.PENDING, label: 'Pending' },
  { key: SupportConversationStatus.RESOLVED, label: 'Resolved' },
  { key: SupportConversationStatus.CLOSED, label: 'Closed' },
  { key: 'trash', label: 'Trash' },
];

const PRIORITY_TONE: Record<SupportPriority, string> = {
  [SupportPriority.LOW]: 'bg-slate-100 text-slate-700 border-slate-200',
  [SupportPriority.NORMAL]: 'bg-sky-50 text-sky-800 border-sky-200',
  [SupportPriority.HIGH]: 'bg-amber-50 text-amber-900 border-amber-200',
  [SupportPriority.URGENT]: 'bg-red-50 text-red-800 border-red-200',
};

const STATUS_TONE: Record<SupportConversationStatus, string> = {
  [SupportConversationStatus.OPEN]: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  [SupportConversationStatus.PENDING]: 'bg-amber-50 text-amber-900 border-amber-200',
  [SupportConversationStatus.RESOLVED]: 'bg-slate-50 text-slate-700 border-slate-200',
  [SupportConversationStatus.CLOSED]: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

// ─────────────────────────────────────────────────────────────────────
// Page

export function AdminSupportContent() {
  // Filter state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [filter, setFilter] = useState<
    SupportConversationStatus | 'all' | 'unread' | 'trash'
  >('all');
  const [priority, setPriority] = useState<SupportPriority | 'all'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  const params = useMemo(() => {
    const base: {
      page: number;
      limit: number;
      search?: string;
      statuses?: SupportConversationStatus[];
      priorities?: SupportPriority[];
      unreadOnly?: boolean;
      includeDeleted?: boolean;
    } = { page, limit: 25 };
    if (search) base.search = search;
    if (priority !== 'all') base.priorities = [priority];
    if (filter === 'unread') base.unreadOnly = true;
    else if (filter === 'trash') base.includeDeleted = true;
    else if (filter !== 'all') base.statuses = [filter];
    return base;
  }, [page, search, filter, priority]);

  const listQuery = useSupportConversations(params);
  const items = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;

  // Always-on socket so the conversation list refreshes when doctors
  // send messages or open new threads.
  useSupportSocket({});

  // When the active conversation is deleted on the server we clear
  // the right-pane selection.
  useEffect(() => {
    if (activeId && !items.find((c) => c.id === activeId)) {
      // Don't clear if it just moved out of the current filter — only
      // if the list is loaded AND the conversation truly disappeared.
      if (!listQuery.isLoading && listQuery.data) {
        // Check via direct fetch to disambiguate: but cheapest is
        // just to let the user re-pick when they come back.
        // (Server-side deletion is handled by the socket hook below.)
      }
    }
  }, [activeId, items, listQuery.isLoading, listQuery.data]);

  const clearSearch = useCallback(() => {
    setSearch('');
    setSearchInputKey((k) => k + 1);
    setPage(1);
  }, []);

  return (
    <div className="flex h-[calc(100dvh-var(--header-height,4rem))] flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <MessageCircle className="size-6 text-primary" />
            Support inbox
          </h1>
          <p className="text-xs text-muted-foreground">
            Direct doctor ↔ admin support threads. Reply, resolve,
            assign priority, or move stale threads to trash.
          </p>
        </div>
      </header>

      {/* Status tabs */}
      <div className="overflow-x-auto">
        <div className="flex w-full min-w-max gap-1 rounded-lg border bg-card p-1">
          {STATUS_OPTIONS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setFilter(tab.key);
                  setPage(1);
                  setActiveId(null);
                }}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-column layout. Mobile: only one column at a time. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[360px_1fr]">
        {/* Left: conversation list */}
        <Card
          className={cn(
            'flex min-h-0 flex-col overflow-hidden',
            activeId ? 'hidden md:flex' : 'flex',
          )}
        >
          <div className="flex items-center gap-2 border-b p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                key={searchInputKey}
                placeholder="Search doctor, subject, message…"
                defaultValue={search}
                onChange={(e) => debouncedSearch(e.target.value)}
                className="h-9 pl-8"
              />
              {search ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
            <Select
              value={priority}
              onValueChange={(v) => {
                setPriority(v as typeof priority);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[110px]">
                <Filter className="mr-1 size-3.5" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {Object.values(SupportPriority).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  listQuery.isFetching && 'animate-spin',
                )}
              />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {listQuery.isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <MessageCircle className="size-8 opacity-40" />
                <p className="font-medium text-foreground">
                  {filter === 'trash'
                    ? 'Trash is empty.'
                    : 'No conversations match.'}
                </p>
                <p className="text-xs">
                  {filter === 'trash'
                    ? 'Soft-deleted conversations show up here.'
                    : 'New support threads will appear here automatically.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conv={c}
                    active={activeId === c.id}
                    onSelect={() => setActiveId(c.id)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t p-2 text-xs">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Right: active conversation */}
        <Card
          className={cn(
            'flex min-h-0 flex-col overflow-hidden',
            activeId ? 'flex' : 'hidden md:flex',
          )}
        >
          {activeId ? (
            <ActiveConversation
              conversationId={activeId}
              onBack={() => setActiveId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessageCircle className="size-10 opacity-30" />
              <p className="text-sm font-medium text-foreground">
                Select a conversation
              </p>
              <p className="max-w-xs text-xs">
                Pick a doctor's thread from the list to read it and
                reply directly.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Conversation list row

function ConversationListItem({
  conv,
  active,
  onSelect,
}: {
  conv: SupportConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const lastAt = new Date(conv.lastMessageAt);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-3 text-left transition focus-visible:outline-none',
          active
            ? 'bg-primary/10'
            : 'hover:bg-accent/40 focus-visible:bg-accent/50',
          conv.deletedAt && 'opacity-60',
        )}
      >
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={getAvatarUrl(conv.doctor?.avatarUrl)} />
          <AvatarFallback>
            <Stethoscope className="size-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">
              {conv.doctor?.fullName ?? 'Unknown doctor'}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {formatDistanceToNowStrict(lastAt, { addSuffix: false })}
            </span>
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {conv.subject ? <strong>{conv.subject}</strong> : null}
            {conv.subject && conv.lastMessagePreview ? ' · ' : ''}
            {conv.lastMessagePreview ?? '—'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-4 items-center rounded-full border px-1.5 text-[10px] font-medium uppercase tracking-wide',
                STATUS_TONE[conv.status],
              )}
            >
              {conv.status}
            </span>
            <span
              className={cn(
                'inline-flex h-4 items-center rounded-full border px-1.5 text-[10px] font-medium uppercase tracking-wide',
                PRIORITY_TONE[conv.priority],
              )}
            >
              {conv.priority}
            </span>
            {conv.unreadByAdmin > 0 ? (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {conv.unreadByAdmin}
              </Badge>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Active conversation pane (admin reply view)

function ActiveConversation({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { data, isLoading, refetch } = useSupportConversation(conversationId);
  const sendMessage = useSendSupportMessage();
  const markRead = useMarkSupportRead();
  const updateStatus = useUpdateSupportStatus();
  const updatePriority = useUpdateSupportPriority();
  const softDelete = useDeleteSupportConversation();
  const restore = useRestoreSupportConversation();

  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<SupportMessage | null>(null);
  const [deletedRemote, setDeletedRemote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The attachment endpoint is JWT-guarded — a plain `<img src>` would
  // 401 because the browser doesn't attach Authorization headers.
  // Fetch via axios (which does), then render the resulting blob URL.
  const lightboxUrl = lightbox
    ? supportAttachmentUrl(lightbox.conversationId, lightbox.id)
    : null;
  const lightboxImg = useAuthedImage(lightboxUrl);

  // Real-time updates + handle remote deletion broadcast.
  useSupportSocket({
    conversationId,
    onConversationDeleted: (id) => {
      if (id === conversationId) setDeletedRemote(true);
    },
  });

  // Mark-read on view + on every new admin message that lands.
  useEffect(() => {
    if (data?.conversation?.id && data.conversation.unreadByAdmin > 0) {
      markRead.mutate(data.conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.conversation?.id, data?.messages?.length]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);

  const conv = data?.conversation;
  const isDeleted = !!conv?.deletedAt || deletedRemote;
  const isClosed = conv?.status === SupportConversationStatus.CLOSED;
  const sendDisabled =
    isDeleted || isClosed || sendMessage.isPending || (!body.trim() && !file);

  const submit = () => {
    if (sendDisabled) return;
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

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 md:hidden"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Avatar className="size-8 shrink-0">
            <AvatarImage src={getAvatarUrl(conv?.doctor?.avatarUrl)} />
            <AvatarFallback>
              <Stethoscope className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {conv?.doctor?.fullName ?? '…'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {conv?.subject ?? conv?.doctor?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conv ? (
            <span
              className={cn(
                'hidden h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase tracking-wide md:inline-flex',
                STATUS_TONE[conv.status],
              )}
            >
              {conv.status}
            </span>
          ) : null}
          {conv && !isDeleted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Status
                </DropdownMenuLabel>
                {Object.values(SupportConversationStatus).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => updateStatus.mutate({ id: conv.id, status: s })}
                    className={cn(
                      'flex items-center justify-between',
                      conv.status === s && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span className="capitalize">{s}</span>
                    {conv.status === s ? <CheckCircle2 className="size-3.5" /> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Priority
                </DropdownMenuLabel>
                {Object.values(SupportPriority).map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => updatePriority.mutate({ id: conv.id, priority: p })}
                    className={cn(
                      'flex items-center justify-between',
                      conv.priority === p && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span className="capitalize">{p}</span>
                    {conv.priority === p ? <CheckCircle2 className="size-3.5" /> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    updateStatus.mutate({
                      id: conv.id,
                      status: SupportConversationStatus.RESOLVED,
                    });
                  }}
                >
                  <CheckCircle2 className="mr-2 size-4 text-emerald-600" />
                  Mark as resolved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setConfirmDelete(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {isDeleted && conv ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                restore.mutate(conv.id, {
                  onSuccess: () => {
                    setDeletedRemote(false);
                    refetch();
                  },
                })
              }
            >
              <ArchiveRestore className="size-3.5" />
              Restore
            </Button>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3"
      >
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 self-end" />
            <Skeleton className="h-16 w-3/4" />
          </>
        ) : isDeleted ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm">
            <AlertTriangle className="size-8 text-amber-600" />
            <p className="font-medium text-foreground">
              This conversation is in trash.
            </p>
            <p className="text-xs text-muted-foreground">
              Restore it to resume replies, or close this view.
            </p>
          </div>
        ) : (
          (data?.messages ?? []).map((m) => (
            <AdminMessageBubble
              key={m.id}
              message={m}
              fromAdmin={m.senderRole !== UserRole.DENTIST}
              onPreviewImage={() => setLightbox(m)}
            />
          ))
        )}
      </div>

      {/* Composer — shared between doctor + admin so the visual
          grammar (attach left, textarea grow, send right) stays
          identical across both sides. */}
      {!isDeleted && !isClosed ? (
        <Composer
          body={body}
          onBodyChange={setBody}
          file={file}
          onFileChange={setFile}
          fileRef={fileRef}
          onSubmit={submit}
          pending={sendMessage.isPending}
          placeholder="Reply to the doctor…"
        />
      ) : isClosed ? (
        <div className="border-t bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          Conversation is closed. Mark it Open to resume replies.
        </div>
      ) : null}

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" />
              Delete this conversation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The doctor will no longer be able to send messages to this
              thread, and it will move to <strong>Trash</strong>. You can
              restore it later if needed. Soft delete — messages and
              attachments stay on disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (conv) {
                  softDelete.mutate(conv.id, {
                    onSuccess: () => {
                      setConfirmDelete(false);
                      onBack();
                    },
                  });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image lightbox — full-screen, authed-blob backed */}
      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
        src={lightboxImg.src}
        alt={lightbox?.attachmentName ?? 'attachment'}
        caption={lightbox?.attachmentName ?? undefined}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Admin-side message bubble (clickable image → opens lightbox)

function AdminMessageBubble({
  message,
  fromAdmin,
  onPreviewImage,
}: {
  message: SupportMessage;
  fromAdmin: boolean;
  onPreviewImage: () => void;
}) {
  const attachmentApiUrl = message.attachmentRelativePath
    ? supportAttachmentUrl(message.conversationId, message.id)
    : null;
  // Same JWT-guarded route as the lightbox — fetch via axios to get
  // the Authorization header attached, then render the blob URL.
  const { src: attachmentSrc, loading: attachmentLoading } =
    useAuthedImage(attachmentApiUrl);
  return (
    <div className={cn('flex flex-col', fromAdmin ? 'items-end' : 'items-start')}>
      <div className="flex items-start gap-2">
        {!fromAdmin ? (
          <Avatar className="size-7 shrink-0">
            <AvatarImage src={getAvatarUrl(message.sender?.avatarUrl)} />
            <AvatarFallback>
              <Stethoscope className="size-3" />
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div
          className={cn(
            'max-w-[80%] rounded-2xl px-3 py-2 shadow-sm',
            fromAdmin
              ? 'rounded-br-sm bg-primary text-primary-foreground'
              : 'rounded-bl-sm border bg-background text-foreground',
          )}
        >
          {attachmentApiUrl ? (
            <button
              type="button"
              onClick={onPreviewImage}
              disabled={!attachmentSrc}
              className="mb-1 block overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open ${message.attachmentName ?? 'attachment'} in full view`}
            >
              {attachmentLoading ? (
                <div className="grid h-32 w-48 animate-pulse place-items-center rounded-md bg-muted/40" />
              ) : attachmentSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentSrc}
                  alt={message.attachmentName ?? 'attachment'}
                  className="max-h-60 w-auto max-w-full cursor-zoom-in rounded-md object-contain"
                />
              ) : (
                <div className="grid h-32 w-48 place-items-center rounded-md bg-muted/40 text-xs text-muted-foreground">
                  Could not load image
                </div>
              )}
            </button>
          ) : null}
          {message.body ? (
            <p className="whitespace-pre-wrap text-sm leading-snug">{message.body}</p>
          ) : null}
        </div>
        {fromAdmin ? (
          <Avatar className="size-7 shrink-0">
            <AvatarFallback>
              <UserCircle2 className="size-3" />
            </AvatarFallback>
          </Avatar>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1 text-[10px] text-muted-foreground',
          fromAdmin ? 'mr-9' : 'ml-9',
        )}
      >
        {format(new Date(message.createdAt), 'MMM d, HH:mm')}
        {fromAdmin && message.readAt ? ' · read' : null}
      </p>
    </div>
  );
}
