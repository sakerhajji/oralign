'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import {
  BellRing,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/hooks';
import type { Notification } from '@/lib/types';

type Filter = 'all' | 'unread' | 'read';

const PAGE_SIZE = 25;

/**
 * Full inbox page. Same backend feed as the bell, but with:
 *   • Filter tabs (All / Unread / Read)
 *   • Pagination (25 per page)
 *   • Per-row mark-read button when the user wants to act without
 *     navigating
 *
 * The page is role-agnostic — the backend scopes the query by JWT,
 * so admins and doctors see only their own inbox.
 */
export function NotificationsPageContent() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  // `unreadOnly` only narrows the wire query when the user explicitly
  // picks the Unread tab. The Read tab is filtered client-side off
  // the same payload so we don't need an extra `readOnly` endpoint.
  const listQuery = useNotifications({
    page,
    limit: PAGE_SIZE,
    unreadOnly: filter === 'unread' ? true : undefined,
  });
  const unreadQuery = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const all = listQuery.data?.data ?? [];
  const items =
    filter === 'read' ? all.filter((n) => !!n.readAt) : all;
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const unread = unreadQuery.data ?? 0;

  return (
    <div className="flex flex-col gap-5 p-3 sm:gap-6 sm:p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <BellRing className="size-6 text-primary" />
            Notifications
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Every alert sent to your account — order updates, payment
            events, treatment plan messages, and team broadcasts.
            Unread first, with filters to narrow the view.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start gap-2"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {markAll.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
          Mark all as read
        </Button>
      </header>

      <div className="overflow-x-auto">
        <div className="flex w-full min-w-max gap-1 rounded-lg border bg-card p-1">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'unread', label: `Unread${unread > 0 ? ` (${unread})` : ''}` },
              { key: 'read', label: 'Read' },
            ] as const
          ).map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setFilter(tab.key);
                  setPage(1);
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

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Inbox</CardTitle>
          <CardDescription>
            {listQuery.isLoading
              ? 'Loading…'
              : `${items.length} of ${total} notifications`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <Inbox className="size-10 opacity-40" />
              <p className="text-sm font-medium">
                {filter === 'unread'
                  ? 'No unread notifications.'
                  : filter === 'read'
                    ? 'No read notifications yet.'
                    : 'Your inbox is empty.'}
              </p>
              <p className="text-xs">
                New activity (orders, payments, treatment plans) will
                show up here automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markRead.mutate(n.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!listQuery.isLoading && totalPages > 1 ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <span className="text-muted-foreground">
            Page {listQuery.data?.page ?? page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const isUnread = !notification.readAt;
  const createdAt = new Date(notification.createdAt);

  const body = (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-4">
      <span
        aria-hidden
        className={cn(
          'mt-1.5 inline-block size-2.5 shrink-0 rounded-full',
          isUnread ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              'text-sm leading-snug',
              isUnread
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {notification.title}
          </p>
          {isUnread ? (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              New
            </Badge>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {notification.message}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <time
            title={format(createdAt, 'PPpp')}
            dateTime={notification.createdAt}
          >
            {formatDistanceToNowStrict(createdAt, { addSuffix: true })}
          </time>
          {isUnread ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMarkRead();
              }}
              className="font-medium text-foreground hover:text-primary"
            >
              Mark as read
            </button>
          ) : (
            <span>Read</span>
          )}
        </div>
      </div>
      {notification.link ? (
        <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </div>
  );

  if (notification.link) {
    return (
      <li>
        <Link
          href={notification.link}
          onClick={() => {
            if (isUnread) onMarkRead();
          }}
          className="block hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (isUnread) onMarkRead();
        }}
        className="w-full text-left hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        {body}
      </button>
    </li>
  );
}
