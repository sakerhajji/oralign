"use client";

import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import {
  Ban,
  Building2,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  Users as UsersIcon,
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
import { UserAvatar } from "@/components/users/user-avatar";
import { useT } from "@/lib/i18n/lang-context";
import type { User } from "@/lib/types";
import { VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function ApprovalBadge({ user }: { user: User }) {
  const { t } = useT();
  if (user.verificationStatus === VerificationStatus.APPROVED) {
    return (
      <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t("usersAdmin.approved")}
      </Badge>
    );
  }
  if (user.verificationStatus === VerificationStatus.REJECTED) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldX className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t("usersAdmin.rejected")}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t("usersAdmin.notApproved")}
    </Badge>
  );
}

function RoleBadge({ role }: { role: User["role"] }) {
  const { t } = useT();
  const privileged = role === "admin" || role === "super_admin";
  return (
    <Badge
      variant={
        privileged ? "default" : role === "designer" ? "secondary" : "outline"
      }
    >
      {t(`usersUi.roles.${role}`)}
    </Badge>
  );
}

function AccountBadges({ user }: { user: User }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={user.isActive ? "outline" : "destructive"}>
        {user.isActive
          ? t("usersAdmin.statusActive")
          : t("usersAdmin.statusBlocked")}
      </Badge>
      <Badge variant={user.isEmailVerified ? "outline" : "secondary"}>
        {user.isEmailVerified
          ? t("usersAdmin.verified")
          : t("usersAdmin.verifyPending")}
      </Badge>
    </div>
  );
}

function UserActionsMenu({
  user,
  viewMode,
  onOpenUser,
  onViewClinic,
  onApprovalChange,
  onUserAction,
}: Omit<
  AdminUsersListProps,
  "users" | "selectedUsers" | "onToggleAll" | "onToggleUser"
> & {
  user: User;
}) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={`${t("usersAdmin.actions")} - ${user.fullName}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("usersAdmin.actions")}</DropdownMenuLabel>
        <DropdownMenuItem
          className="min-h-10"
          onClick={() => onOpenUser(user.id, "profile")}
        >
          <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("usersAdmin.editUser")}
        </DropdownMenuItem>
        {user.role === "dentist" && !user.dentistProfile && (
          <DropdownMenuItem
            className="min-h-10"
            onClick={() => onOpenUser(user.id, "clinic")}
          >
            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("usersAdmin.addClinic")}
          </DropdownMenuItem>
        )}
        {user.role === "dentist" && user.dentistProfile && (
          <>
            <DropdownMenuItem
              className="min-h-10"
              onClick={() => onViewClinic(user)}
            >
              <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("usersAdmin.viewClinic")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-10"
              onClick={() => onOpenUser(user.id, "schedule")}
            >
              <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("usersAdmin.openingHours")}
            </DropdownMenuItem>
          </>
        )}

        {viewMode === "active" && (
          <>
            <DropdownMenuSeparator />
            {user.verificationStatus !== VerificationStatus.APPROVED && (
              <DropdownMenuItem
                className="min-h-10 text-emerald-700 focus:text-emerald-700"
                onClick={() => onApprovalChange(user.id, "approved")}
              >
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("usersAdmin.approve")}
              </DropdownMenuItem>
            )}
            {user.verificationStatus !== VerificationStatus.REJECTED && (
              <DropdownMenuItem
                className="min-h-10 text-destructive focus:text-destructive"
                onClick={() => onApprovalChange(user.id, "rejected")}
              >
                <ShieldX className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("usersAdmin.reject")}
              </DropdownMenuItem>
            )}
            {user.verificationStatus !== VerificationStatus.PENDING && (
              <DropdownMenuItem
                className="min-h-10"
                onClick={() => onApprovalChange(user.id, "pending")}
              >
                <ShieldAlert className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("usersAdmin.markPending")}
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        {viewMode === "deleted" ? (
          <>
            <DropdownMenuItem
              className="min-h-10 text-emerald-700 focus:text-emerald-700"
              onClick={() => onUserAction(user, "restore")}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("usersAdmin.restoreUser")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-10 text-destructive focus:text-destructive"
              onClick={() => onUserAction(user, "permanent")}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("usersAdmin.permanentlyDelete")}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              className="min-h-10"
              onClick={() =>
                onUserAction(user, user.isActive ? "block" : "activate")
              }
            >
              {user.isActive ? (
                <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {user.isActive
                ? t("usersAdmin.blockUser")
                : t("usersAdmin.activateUser")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-10 text-orange-700 focus:text-orange-700"
              onClick={() => onUserAction(user, "delete")}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("usersAdmin.deleteUser")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function dateLabel(value: string | undefined, lang: string, fallback: string) {
  if (!value) return fallback;
  return format(new Date(value), lang === "fr" ? "d MMM yyyy" : "MMM d, yyyy", {
    locale: lang === "fr" ? frLocale : undefined,
  });
}

export function AdminUsersList(props: AdminUsersListProps) {
  const { t, lang } = useT();
  const {
    users,
    viewMode,
    selectedUsers,
    onToggleAll,
    onToggleUser,
    onOpenUser,
    onApprovalChange,
  } = props;
  const allSelected = users.length > 0 && selectedUsers.size === users.length;

  if (users.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center text-muted-foreground">
        <UsersIcon className="mb-4 h-10 w-10 opacity-40" aria-hidden="true" />
        <p className="font-medium text-foreground">
          {viewMode === "deleted"
            ? t("usersAdmin.emptyDeleted")
            : t("usersAdmin.emptyActive")}
        </p>
        <p className="mt-1 max-w-sm text-sm">{t("usersAdmin.emptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 xl:hidden">
        <div className="flex min-h-11 items-center justify-between rounded-md border bg-muted/30 px-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
            <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
            {t("usersAdmin.selectAll")}
          </label>
          <span className="text-xs text-muted-foreground">{users.length}</span>
        </div>

        {users.map((user) => {
          const pending =
            user.verificationStatus === VerificationStatus.PENDING;
          const rejected =
            user.verificationStatus === VerificationStatus.REJECTED;
          return (
            <article
              key={user.id}
              className={cn(
                "overflow-hidden rounded-lg border bg-card",
                pending && "border-l-4 border-l-amber-500",
                rejected && "border-l-4 border-l-destructive",
              )}
            >
              <div className="flex items-start gap-3 p-4">
                <Checkbox
                  checked={selectedUsers.has(user.id)}
                  onCheckedChange={() => onToggleUser(user.id)}
                  aria-label={`${t("usersAdmin.colUser")} ${user.fullName}`}
                  className="mt-1"
                />
                <UserAvatar user={user} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user.fullName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                  {user.phone && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.phone}
                    </p>
                  )}
                </div>
                <UserActionsMenu user={user} {...props} />
              </div>

              <div className="flex flex-wrap gap-2 border-y bg-muted/20 px-4 py-3">
                <ApprovalBadge user={user} />
                <RoleBadge role={user.role} />
                <AccountBadges user={user} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-xs">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">
                    {t("usersAdmin.colLastLogin")}
                  </dt>
                  <dd className="mt-0.5 truncate font-medium text-foreground">
                    {dateLabel(user.lastLoginAt, lang, t("usersAdmin.never"))}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">
                    {t("usersAdmin.colCreatedAt")}
                  </dt>
                  <dd className="mt-0.5 truncate font-medium text-foreground">
                    {dateLabel(user.createdAt, lang, "—")}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
                {viewMode === "active" && pending && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 sm:flex-none"
                      onClick={() => onApprovalChange(user.id, "rejected")}
                    >
                      <ShieldX className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t("usersAdmin.reject")}
                    </Button>
                    <Button
                      size="sm"
                      className="h-10 flex-1 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-none"
                      onClick={() => onApprovalChange(user.id, "approved")}
                    >
                      <ShieldCheck
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      {t("usersAdmin.approve")}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-full sm:w-auto"
                  onClick={() => onOpenUser(user.id, "profile")}
                >
                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("usersAdmin.viewDetails")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border xl:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-12" />
            <col className="w-[29%]" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-32" />
          </colgroup>
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleAll}
                  aria-label={t("usersAdmin.selectAll")}
                />
              </th>
              <th className="px-3 py-3 text-left font-medium">
                {t("usersAdmin.colUser")}
              </th>
              <th className="px-3 py-3 text-left font-medium">
                {t("usersAdmin.colApproval")}
              </th>
              <th className="px-3 py-3 text-left font-medium">
                {t("usersAdmin.colRole")}
              </th>
              <th className="px-3 py-3 text-left font-medium">
                {t("usersAdmin.colStatus")}
              </th>
              <th className="px-3 py-3 text-left font-medium">
                {t("usersAdmin.colLastLogin")}
              </th>
              <th className="px-3 py-3 text-right font-medium">
                {t("usersAdmin.colActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => {
              const pending =
                user.verificationStatus === VerificationStatus.PENDING;
              const rejected =
                user.verificationStatus === VerificationStatus.REJECTED;
              return (
                <tr
                  key={user.id}
                  className={cn(
                    "transition-colors hover:bg-muted/30",
                    pending && "bg-amber-50/30 dark:bg-amber-950/10",
                    rejected && "bg-red-50/30 dark:bg-red-950/10",
                  )}
                >
                  <td className="px-3 py-3 align-middle">
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => onToggleUser(user.id)}
                      aria-label={`${t("usersAdmin.colUser")} ${user.fullName}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} className="h-10 w-10 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {user.fullName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                        {user.phone && (
                          <p className="truncate text-xs text-muted-foreground">
                            {user.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <ApprovalBadge user={user} />
                  </td>
                  <td className="px-3 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-3 py-3">
                    <AccountBadges user={user} />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    <p>
                      {dateLabel(user.lastLoginAt, lang, t("usersAdmin.never"))}
                    </p>
                    <p className="mt-1 truncate">
                      {t("usersAdmin.colCreatedAt")}:{" "}
                      {dateLabel(user.createdAt, lang, "—")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenUser(user.id, "profile")}
                      >
                        {t("usersAdmin.viewDetails")}
                      </Button>
                      <UserActionsMenu user={user} {...props} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
