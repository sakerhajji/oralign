"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Ban,
  Building2,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  Gift,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/users/user-avatar";
import { useT } from "@/lib/i18n/lang-context";
import type { Lang } from "@/lib/i18n/dict";
import type { User } from "@/lib/types";
import { UserRole, VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTimestampDay } from "@/lib/utils/calendar-date";

export type UserRowAction =
  "delete" | "restore" | "permanent" | "block" | "activate";

type ApprovalStatus = "pending" | "approved" | "rejected";

interface AdminUsersListProps {
  users: User[];
  viewMode: "active" | "deleted";
  selectedUsers: Set<string>;
  onToggleAll: () => void;
  onToggleUser: (id: string) => void;
  onOpenUser: (userId: string, tab?: string) => void;
  onViewClinic: (user: User) => void;
  onApprovalChange: (userId: string, status: ApprovalStatus) => void;
  onUserAction: (user: User, action: UserRowAction) => void;
}

type RowProps = Omit<
  AdminUsersListProps,
  "users" | "selectedUsers" | "onToggleAll"
> & {
  user: User;
  selected: boolean;
};

const EMERALD_BADGE =
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
const AMBER_BADGE =
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

function day(value: string | undefined, lang: Lang): string | null {
  return value ? formatTimestampDay(value, lang) : null;
}

/** "+21698123456" → "+216 98 123 456" (TN / FR); other numbers as stored. */
function formatPhone(phone: string): string {
  const tn = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(phone);
  if (tn) return `+216 ${tn[1]} ${tn[2]} ${tn[3]}`;
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  if (fr) return `+33 ${fr.slice(1).join(" ")}`;
  return phone;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function ApprovalBadge({ user }: { user: User }) {
  const { t } = useT();
  if (user.verificationStatus === VerificationStatus.APPROVED) {
    return (
      <Badge className={cn("max-w-full", EMERALD_BADGE)}>
        <ShieldCheck aria-hidden="true" />
        <span className="truncate">{t("usersAdmin.approved")}</span>
      </Badge>
    );
  }
  if (user.verificationStatus === VerificationStatus.REJECTED) {
    return (
      <Badge variant="destructive" className="max-w-full">
        <ShieldX aria-hidden="true" />
        <span className="truncate">{t("usersAdmin.rejected")}</span>
      </Badge>
    );
  }
  return (
    <Badge className={cn("max-w-full", AMBER_BADGE)}>
      <ShieldAlert aria-hidden="true" />
      <span className="truncate">{t("usersAdmin.notApproved")}</span>
    </Badge>
  );
}

function RoleBadge({ role }: { role: User["role"] }) {
  const { t } = useT();
  const privileged = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const label = t(`usersUi.roles.${role}`);
  return (
    <Badge
      variant={privileged ? "secondary" : "outline"}
      className="max-w-full"
      title={label}
    >
      <span className="truncate">{label}</span>
    </Badge>
  );
}

/**
 * Oralign gift mark, dentists only: emerald while available, neutral
 * once used (a link to the gifted case when there is one). Nothing for
 * other roles, nor for payloads that do not carry the mark.
 */
export function GiftBadge({ user }: { user: User }) {
  const { t } = useT();
  if (user.role !== UserRole.DENTIST || user.welcomeGiftUsedAt === undefined) {
    return null;
  }
  if (!user.welcomeGiftUsedAt) {
    return (
      <Badge className={cn("max-w-full", EMERALD_BADGE)}>
        <Gift aria-hidden="true" />
        <span className="truncate">{t("usersDesk.gift.available")}</span>
      </Badge>
    );
  }
  const order = user.welcomeGiftOrder;
  const content = (
    <>
      <Gift aria-hidden="true" />
      <span className="truncate">{t("usersDesk.gift.used")}</span>
    </>
  );
  // An archived case no longer opens (GET /orders/:id is 404): plain badge.
  if (!order || order.archived) {
    return (
      <Badge
        variant="outline"
        className="max-w-full text-muted-foreground"
        title={
          order
            ? t("usersDesk.gift.usedCase", { code: order.orderCode })
            : undefined
        }
      >
        {content}
      </Badge>
    );
  }
  const label = t("usersDesk.gift.usedCase", { code: order.orderCode });
  return (
    <Badge
      asChild
      variant="outline"
      className="max-w-full text-muted-foreground"
    >
      <Link href={`/dashboard/orders/${order.id}`} title={label} aria-label={label}>
        {content}
      </Link>
    </Badge>
  );
}

function BlockedBadge() {
  const { t } = useT();
  return (
    <Badge variant="destructive" className="max-w-full">
      <Ban aria-hidden="true" />
      <span className="truncate">{t("usersAdmin.statusBlocked")}</span>
    </Badge>
  );
}

// ─── Row actions ─────────────────────────────────────────────────────────────

function UserActionsMenu({
  user,
  viewMode,
  onOpenUser,
  onViewClinic,
  onApprovalChange,
  onUserAction,
}: Pick<
  RowProps,
  | "user"
  | "viewMode"
  | "onOpenUser"
  | "onViewClinic"
  | "onApprovalChange"
  | "onUserAction"
>) {
  const { t } = useT();
  const isDentist = user.role === UserRole.DENTIST;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`${t("usersAdmin.actions")} - ${user.fullName}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("usersAdmin.actions")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onOpenUser(user.id, "profile")}>
          <Edit aria-hidden="true" />
          {t("usersAdmin.editUser")}
        </DropdownMenuItem>
        {isDentist && !user.dentistProfile && (
          <DropdownMenuItem onClick={() => onOpenUser(user.id, "clinic")}>
            <Building2 aria-hidden="true" />
            {t("usersAdmin.addClinic")}
          </DropdownMenuItem>
        )}
        {isDentist && user.dentistProfile && (
          <>
            <DropdownMenuItem onClick={() => onViewClinic(user)}>
              <Building2 aria-hidden="true" />
              {t("usersAdmin.viewClinic")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenUser(user.id, "schedule")}>
              <Clock aria-hidden="true" />
              {t("usersAdmin.openingHours")}
            </DropdownMenuItem>
          </>
        )}
        {isDentist && viewMode === "active" && (
          <DropdownMenuItem onClick={() => onOpenUser(user.id, "account")}>
            <Gift aria-hidden="true" />
            {t("usersDesk.gift.manage")}
          </DropdownMenuItem>
        )}

        {viewMode === "active" && (
          <>
            <DropdownMenuSeparator />
            {user.verificationStatus !== VerificationStatus.APPROVED && (
              <DropdownMenuItem
                className="text-emerald-700 focus:text-emerald-700"
                onClick={() => onApprovalChange(user.id, "approved")}
              >
                <ShieldCheck aria-hidden="true" />
                {t("usersAdmin.approve")}
              </DropdownMenuItem>
            )}
            {user.verificationStatus !== VerificationStatus.REJECTED && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onApprovalChange(user.id, "rejected")}
              >
                <ShieldX aria-hidden="true" />
                {t("usersAdmin.reject")}
              </DropdownMenuItem>
            )}
            {user.verificationStatus !== VerificationStatus.PENDING && (
              <DropdownMenuItem
                onClick={() => onApprovalChange(user.id, "pending")}
              >
                <ShieldAlert aria-hidden="true" />
                {t("usersAdmin.markPending")}
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        {viewMode === "deleted" ? (
          <>
            <DropdownMenuItem
              className="text-emerald-700 focus:text-emerald-700"
              onClick={() => onUserAction(user, "restore")}
            >
              <RefreshCw aria-hidden="true" />
              {t("usersAdmin.restoreUser")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onUserAction(user, "permanent")}
            >
              <Trash2 aria-hidden="true" />
              {t("usersAdmin.permanentlyDelete")}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() =>
                onUserAction(user, user.isActive ? "block" : "activate")
              }
            >
              {user.isActive ? (
                <Ban aria-hidden="true" />
              ) : (
                <CheckCircle aria-hidden="true" />
              )}
              {user.isActive
                ? t("usersAdmin.blockUser")
                : t("usersAdmin.activateUser")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onUserAction(user, "delete")}
            >
              <Trash2 aria-hidden="true" />
              {t("usersAdmin.deleteUser")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Thin left accent: amber for pending approval, red for rejected. */
function AttentionAccent({ user }: { user: User }) {
  if (user.verificationStatus === VerificationStatus.APPROVED) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 left-0 w-0.5",
        user.verificationStatus === VerificationStatus.REJECTED
          ? "bg-destructive"
          : "bg-amber-500",
      )}
    />
  );
}

function UserIdentity({
  user,
  onOpen,
  avatarClassName,
  extra,
}: {
  user: User;
  onOpen: () => void;
  avatarClassName: string;
  extra?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar user={user} className={cn("shrink-0", avatarClassName)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            title={t("usersDesk.list.openUser", { name: user.fullName })}
          >
            {user.fullName}
          </button>
          {extra}
        </div>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        {user.phone && (
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {formatPhone(user.phone)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Card (below lg) ─────────────────────────────────────────────────────────

function UserCard(props: RowProps) {
  const { t, lang } = useT();
  const { user, selected, viewMode, onToggleUser, onOpenUser, onApprovalChange } =
    props;
  const pending =
    viewMode === "active" &&
    user.verificationStatus === VerificationStatus.PENDING;
  const lastLogin = day(user.lastLoginAt, lang);
  return (
    <li
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        selected && "ring-2 ring-primary/40",
      )}
    >
      <AttentionAccent user={user} />
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleUser(user.id)}
          aria-label={t("usersDesk.list.selectUser", { name: user.fullName })}
          className="mt-3"
        />
        <div className="min-w-0 flex-1">
          <UserIdentity
            user={user}
            onOpen={() => onOpenUser(user.id, "profile")}
            avatarClassName="size-10"
          />
        </div>
        <UserActionsMenu {...props} />
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        <RoleBadge role={user.role} />
        <ApprovalBadge user={user} />
        {!user.isActive && <BlockedBadge />}
        <GiftBadge user={user} />
        {!user.isEmailVerified && (
          <Badge variant="outline" className="max-w-full text-muted-foreground">
            <span className="truncate">{t("usersDesk.list.emailUnverified")}</span>
          </Badge>
        )}
      </div>

      <div className="mt-auto flex min-h-11 items-center justify-between gap-2 border-t px-3 py-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {lastLogin
            ? t("usersDesk.list.lastLogin", { date: lastLogin })
            : t("usersDesk.list.neverLoggedIn")}
        </p>
        {pending ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApprovalChange(user.id, "rejected")}
            >
              <ShieldX aria-hidden="true" />
              {t("usersAdmin.reject")}
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => onApprovalChange(user.id, "approved")}
            >
              <ShieldCheck aria-hidden="true" />
              {t("usersAdmin.approve")}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onOpenUser(user.id, "profile")}
          >
            <Eye aria-hidden="true" />
            {t("usersDesk.list.open")}
          </Button>
        )}
      </div>
    </li>
  );
}

// ─── Table (lg and up) ───────────────────────────────────────────────────────

/*
 * Fixed layout: every column but "User" has a width, the user column takes
 * the rest and truncates, so the table never scrolls sideways. Account and
 * activity only show from xl (1024 px leaves ~920 px for the table).
 */
const COLS = {
  select: "w-11 pl-4",
  role: "w-36",
  approval: "w-36",
  account: "hidden w-32 xl:table-cell",
  gift: "w-44",
  activity: "hidden w-40 xl:table-cell",
  actions: "w-[5.5rem] pr-3",
};

function UsersTableHead({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll?: () => void;
}) {
  const { t } = useT();
  const th = "h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground";
  return (
    <thead className="border-b bg-muted/40">
      <tr>
        <th className={cn(th, COLS.select)}>
          {onToggleAll && (
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleAll}
              aria-label={t("usersDesk.list.selectPage")}
            />
          )}
        </th>
        <th className={th}>{t("usersAdmin.colUser")}</th>
        <th className={cn(th, COLS.role)}>{t("usersAdmin.colRole")}</th>
        <th className={cn(th, COLS.approval)}>{t("usersAdmin.colApproval")}</th>
        <th className={cn(th, COLS.account)}>{t("usersDesk.list.colAccount")}</th>
        <th className={cn(th, COLS.gift)}>{t("usersDesk.list.colGift")}</th>
        <th className={cn(th, COLS.activity)}>{t("usersAdmin.colLastLogin")}</th>
        <th className={cn(th, COLS.actions)}>
          <span className="sr-only">{t("usersAdmin.colActions")}</span>
        </th>
      </tr>
    </thead>
  );
}

function UserTableRow(props: RowProps) {
  const { t, lang } = useT();
  const { user, selected, onToggleUser, onOpenUser } = props;
  const lastLogin = day(user.lastLoginAt, lang);
  const created = day(user.createdAt, lang);
  const isDentist = user.role === UserRole.DENTIST;
  return (
    <tr
      data-state={selected ? "selected" : undefined}
      className="border-b transition-colors last:border-0 hover:bg-muted/40 data-[state=selected]:bg-muted/60"
    >
      <td className={cn("relative px-2 py-2.5 align-middle", COLS.select)}>
        <AttentionAccent user={user} />
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleUser(user.id)}
          aria-label={t("usersDesk.list.selectUser", { name: user.fullName })}
        />
      </td>
      <td className="min-w-0 px-2 py-2.5 align-middle">
        <UserIdentity
          user={user}
          onOpen={() => onOpenUser(user.id, "profile")}
          avatarClassName="size-9"
          extra={
            !user.isActive ? (
              <span className="shrink-0 xl:hidden">
                <BlockedBadge />
              </span>
            ) : null
          }
        />
      </td>
      <td className="px-2 py-2.5 align-middle">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-2 py-2.5 align-middle">
        <ApprovalBadge user={user} />
      </td>
      <td className={cn("px-2 py-2.5 align-middle", COLS.account)}>
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              user.isActive ? "bg-emerald-500" : "bg-destructive",
            )}
          />
          <span className="truncate">
            {user.isActive
              ? t("usersAdmin.statusActive")
              : t("usersAdmin.statusBlocked")}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {user.isEmailVerified
            ? t("usersDesk.list.emailVerified")
            : t("usersDesk.list.emailUnverified")}
        </p>
      </td>
      <td className="px-2 py-2.5 align-middle">
        {isDentist ? (
          <GiftBadge user={user} />
        ) : (
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            —
          </span>
        )}
      </td>
      <td className={cn("px-2 py-2.5 align-middle", COLS.activity)}>
        <p className="truncate text-sm">
          {lastLogin ?? t("usersAdmin.never")}
        </p>
        {created && (
          <p className="truncate text-xs text-muted-foreground">
            {t("usersDesk.list.created", { date: created })}
          </p>
        )}
      </td>
      <td className="px-2 py-2.5 pr-3 align-middle">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenUser(user.id, "profile")}
            aria-label={t("usersDesk.list.openUser", { name: user.fullName })}
            title={t("usersDesk.list.open")}
          >
            <Eye className="size-4" aria-hidden="true" />
          </Button>
          <UserActionsMenu {...props} />
        </div>
      </td>
    </tr>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * One responsive list: cards below lg (two columns from md), a compact
 * fixed-layout table from lg. Each user is rendered once per layout.
 */
export function AdminUsersList(props: AdminUsersListProps) {
  const { users, selectedUsers, onToggleAll, ...rowProps } = props;
  const allSelected =
    users.length > 0 && users.every((u) => selectedUsers.has(u.id));

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
        {users.map((user) => (
          <UserCard
            key={user.id}
            {...rowProps}
            user={user}
            selected={selectedUsers.has(user.id)}
          />
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
        <table className="w-full table-fixed text-sm">
          <UsersTableHead allSelected={allSelected} onToggleAll={onToggleAll} />
          <tbody>
            {users.map((user) => (
              <UserTableRow
                key={user.id}
                {...rowProps}
                user={user}
                selected={selectedUsers.has(user.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Same shapes as the loaded list (cards / table), so nothing jumps. */
export function UsersListSkeleton({ rows = 6 }: { rows?: number }) {
  const items = Array.from({ length: rows }, (_, i) => i);
  return (
    <div aria-hidden="true">
      <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
        {items.map((i) => (
          <li
            key={i}
            className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex items-start gap-3 p-3">
              <Skeleton className="mt-3 size-4 rounded-[4px]" />
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="size-8 shrink-0" />
            </div>
            <div className="flex gap-1.5 px-3 pb-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="flex min-h-11 items-center justify-between border-t px-3 py-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-7 w-20" />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
        <table className="w-full table-fixed text-sm">
          <UsersTableHead allSelected={false} />
          <tbody>
            {items.map((i) => (
              <tr key={i} className="border-b last:border-0">
                <td className={cn("px-2 py-2.5", COLS.select)}>
                  <Skeleton className="size-4 rounded-[4px]" />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </td>
                <td className="px-2 py-2.5">
                  <Skeleton className="h-5 w-24 rounded-full" />
                </td>
                <td className={cn("px-2 py-2.5", COLS.account)}>
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </td>
                <td className="px-2 py-2.5">
                  <Skeleton className="h-5 w-28 rounded-full" />
                </td>
                <td className={cn("px-2 py-2.5", COLS.activity)}>
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </td>
                <td className="px-2 py-2.5 pr-3">
                  <div className="flex justify-end gap-1">
                    <Skeleton className="size-8" />
                    <Skeleton className="size-8" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
