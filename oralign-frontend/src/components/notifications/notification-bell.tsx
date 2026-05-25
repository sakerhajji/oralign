'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight, Bell, CheckCheck, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/hooks';
import { useAuth } from '@/lib/providers/auth-provider';
import type { Notification } from '@/lib/types';

/**
 * Header bell — unread badge + dropdown that lists the **20** most-
 * recent notifications and links out to the full `/dashboard/
 * notifications` page for the long-tail history. Click a row → marks
 * it read + navigates to the `link` the backend stored. "Mark all
 * read" sweeps the inbox in one shot.
 *
 * Hook flow:
 *   • `useUnreadNotificationCount` polls every 20 s for the badge.
 *   • `useNotifications({ limit: 20 })` only runs when the dropdown
 *      is open — we don't keep 20 rows hot in cache for every signed-
 *      in user.
 *   • Marking invalidates both queries so badge + list stay aligned.
 */
export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  const unreadQuery = useUnreadNotificationCount(isAuthenticated);
  // Dropdown shows the last 20 rows. The full history (with read/
  // unread filter + pagination) lives at /dashboard/notifications,
  // reachable via the "View all" footer link at the bottom of this
  // menu.
  const listQuery = useNotifications({ limit: 20 }, isAuthenticated && open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (!isAuthenticated) return null;

  const unread = unreadQuery.data ?? 0;
  const items = listQuery.data?.data ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // h-10 w-10 gives the trigger a comfortable hit target on
          // touch screens while keeping the icon size proportional
          // to a larger bell glyph (size-7 ≈ 28 px). Reads as the
          // "primary inbox" affordance in the header rather than a
          // tiny side action.
          className="relative h-10 w-10"
          aria-label={`Notifications (${unread} unread)`}
        >
          <Bell className="!size-7" />
          {unread > 0 ? (
            <span
              aria-hidden
              // text-white explicitly so the count is legible on the
              // red badge under every theme — `destructive-foreground`
              // resolves to near-black on the light theme, which made
              // the count almost invisible on a saturated red dot.
              className="absolute right-0.5 top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[min(calc(100vw-1.5rem),420px)] overflow-hidden rounded-2xl border bg-popover p-0 shadow-2xl shadow-foreground/10"
      >
        <header className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
              <Bell className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">
                Notifications
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unread > 0
                  ? `${unread} unread update${unread > 1 ? 's' : ''}`
                  : 'You are all caught up'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full px-2.5 text-xs"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-1 size-3.5" />
            Mark all
          </Button>
        </header>

        <div className="border-b px-4 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <p className="font-medium text-muted-foreground">
              Recent activity
            </p>
            <p className="text-xs text-muted-foreground">
              {items.length > 0 ? `${items.length} latest` : 'Inbox empty'}
            </p>
          </div>
        </div>

        {/* Scroll area — wrapped in a relative container so the
            footer CTA can sit visually above it (with a soft top
            shadow) and the last row no longer reads as if it's
            cut by the footer. */}
        <div className="relative">
          <ScrollArea className="h-[min(64vh,430px)]">
            {listQuery.isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                <span className="grid size-12 place-items-center rounded-full bg-muted">
                  <Inbox className="size-6 opacity-50" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Nothing here yet.
                </p>
                <p className="max-w-64 text-xs leading-relaxed">
                  You&apos;ll see new orders, payment updates, and
                  treatment messages in this panel.
                </p>
              </div>
            ) : (
              // pb-2 inside the list creates an explicit gap so the
              // last row doesn't sit flush against the footer — the
              // scroll content visually "ends" before the action
              // band starts.
              <ul className="space-y-2 p-2 pb-3">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onActivate={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>

          {/* Top gradient — fades the last visible row into the
              footer so a partial row no longer reads as "cut off".
              Pointer-events-none keeps the gradient strictly
              cosmetic; clicks fall through to the row below. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover to-transparent"
          />
        </div>

        {/* Footer CTA — links to the dedicated history page. Sits
            below the scroll area as its own visually-lifted band so
            it reads as a distinct "go to inbox" action, not a
            footnote.

            Design notes:
              • `border-t` + a soft upward shadow give it physical
                separation from the scroll content above.
              • `bg-muted/40` tints the band slightly so the CTA
                reads as an action shelf, not a continuation of the
                list rows.
              • `group` synchronises hover — the arrow translates
                2 px right while the band lifts to `bg-primary/10`
                and the text adopts the primary colour. */}
        <Link
          href="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="group flex items-center justify-between gap-3 border-t bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-[0_-8px_18px_-18px_rgba(0,0,0,0.45)] transition-colors hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            <Inbox className="size-4" />
            View all notifications
          </span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({
  notification,
  onActivate,
}: {
  notification: Notification;
  onActivate: () => void;
}) {
  const isUnread = !notification.readAt;
  const createdAt = new Date(notification.createdAt);
  // When the backend provided a deep link we render the whole row as a
  // Next.js <Link>; otherwise it's just a clickable mark-read button.
  // Either way `onActivate` fires.
  const Inner = (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-3 transition-all',
        isUnread
          ? 'border-primary/20 bg-primary/[0.04] shadow-sm shadow-primary/5'
          : 'border-border/60 bg-background hover:border-primary/20 hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ring-1',
          isUnread
            ? 'bg-primary/10 text-primary ring-primary/15'
            : 'bg-muted text-muted-foreground ring-border',
        )}
      >
        <Bell className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={cn(
              'min-w-0 flex-1 text-sm leading-snug',
              isUnread ? 'font-semibold text-foreground' : 'text-foreground',
            )}
          >
            {notification.title}
          </p>
          {isUnread ? (
            <span className="mt-0.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              New
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {notification.message}
        </p>
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {formatDistanceToNowStrict(createdAt, {
            addSuffix: true,
          })}
        </p>
      </div>
      {notification.link ? (
        <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      ) : null}
    </div>
  );

  return (
    <li>
      {notification.link ? (
        <Link
          href={notification.link}
          onClick={onActivate}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onActivate}
          className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Inner}
        </button>
      )}
    </li>
  );
}
