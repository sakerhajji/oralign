'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUsers, useDeletedUsers, useBulkDeleteUsers, useBulkRestoreUsers, useBulkUpdateStatus, useBulkPermanentlyDeleteUsers, useUpdateApproval } from '@/lib/hooks';
import { UserRole, VerificationStatus } from '@/lib/types';
import type { User } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  MoreVertical,
  Trash2,
  Ban,
  CheckCircle,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  RefreshCw,
  Building2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { UserAvatar } from "@/components/users/user-avatar";
import { CreateUserDialog } from "@/components/users/user-dialogs";
import { UserDetailSheet } from "@/components/users/user-detail-sheet";
import { ClinicViewDialog } from "@/components/users/clinic-view-dialog";
import { SearchFilters } from "@/components/users/search-filters";
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { useT } from '@/lib/i18n/lang-context';

export function UsersPageContent() {
  const { t, lang } = useT();
  const searchParams = useSearchParams();
  
  // State - get page from URL params
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [limit] = useState(10);
  const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active');
  const [filters, setFilters] = useState({
    search: '',
    role: 'all',
    status: 'all',
  });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  
  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState('profile');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'delete' | 'restore' | 'permanent' | 'block' | 'activate' | null>(null);
  const [clinicViewUser, setClinicViewUser] = useState<User | null>(null);

  // Handle filter changes from SearchFilters component
  const handleFiltersChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  }, []);

  // Build API params
  const apiParams = useMemo(() => {
    const params: Record<string, unknown> = { page, limit };
    if (filters.search) params.search = filters.search;
    if (filters.role !== 'all') params.role = filters.role;
    if (filters.status === 'active') params.isActive = true;
    if (filters.status === 'blocked') params.isActive = false;
    return params;
  }, [page, limit, filters]);

  // Queries and mutations
  const activeUsersQuery = useUsers(apiParams);
  const deletedUsersQuery = useDeletedUsers(apiParams);
  const { data, isLoading, error, refetch } = viewMode === 'deleted' ? deletedUsersQuery : activeUsersQuery;
  const bulkDelete = useBulkDeleteUsers();
  const bulkRestore = useBulkRestoreUsers();
  const bulkPermanentDelete = useBulkPermanentlyDeleteUsers();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const updateApproval = useUpdateApproval();

  // Display order: pending users float to the top so admins notice them
  // first; rejected accounts come next so they don't get forgotten; approved
  // users fall to the bottom of the page.
  const displayUsers = useMemo(() => {
    const rank: Record<string, number> = {
      [VerificationStatus.PENDING]: 0,
      [VerificationStatus.REJECTED]: 1,
      [VerificationStatus.APPROVED]: 2,
    };
    return [...(data?.data ?? [])].sort((a, b) => {
      const aRank = rank[a.verificationStatus] ?? 99;
      const bRank = rank[b.verificationStatus] ?? 99;
      if (aRank !== bRank) return aRank - bRank;
      // Within a tier, newest first so fresh signups bubble up.
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [data?.data]);

  const pendingCount = useMemo(
    () =>
      displayUsers.filter(
        (u) => u.verificationStatus === VerificationStatus.PENDING,
      ).length,
    [displayUsers],
  );

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedUsers.size === data?.data.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(data?.data.map(u => u.id) || []));
    }
  };

  const toggleSelectUser = (id: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedUsers(newSelected);
  };

  // Bulk actions
  const handleBulkAction = async (action: 'delete' | 'restore' | 'permanent' | 'block' | 'activate') => {
    const ids = Array.from(selectedUsers);
    if (ids.length === 0) return;

    if (action === 'delete') {
      await bulkDelete.mutateAsync({ ids });
    } else if (action === 'restore') {
      await bulkRestore.mutateAsync({ ids });
    } else if (action === 'permanent') {
      await bulkPermanentDelete.mutateAsync({ ids });
    } else {
      await bulkUpdateStatus.mutateAsync({ ids, isActive: action === 'activate' });
    }
    setSelectedUsers(new Set());
    setBulkActionType(null);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'destructive' as const;
      case 'dentist':
        return 'default' as const;
      case 'designer':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('usersAdmin.title')}</h1>
            <p className="text-muted-foreground">{t('usersAdmin.intro')}</p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            {t('usersAdmin.addUser')}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <Skeleton className="h-10 w-80" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">{t('usersAdmin.error')}</h2>
            <p className="text-muted-foreground mt-2">{t('usersAdmin.errorBody')}</p>
            <p className="text-sm text-red-500 mt-1">{error.message}</p>
            <Button
              onClick={() => refetch()}
              className="mt-4"
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('usersAdmin.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('usersAdmin.title')}</h1>
          <p className="text-muted-foreground">{t('usersAdmin.intro')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('usersAdmin.addUser')}
        </Button>
      </div>

      {/* Pending-approval banner — surfaces the count up top so admins
          can scan even before they look at the table. */}
      {viewMode === 'active' && pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              {pendingCount === 1
                ? t('usersAdmin.pendingBannerOne', { count: pendingCount })
                : t('usersAdmin.pendingBannerMany', { count: pendingCount })}
            </span>
            <span className="ml-1 text-amber-700/80 dark:text-amber-300/80">
              {t('usersAdmin.pendingBannerSuffix')}
            </span>
          </div>
        </div>
      )}

      <Tabs
        value={viewMode}
        onValueChange={(value) => {
          setViewMode(value as 'active' | 'deleted');
          setSelectedUsers(new Set());
          setPage(1);
          setBulkActionType(null);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="active">{t('usersAdmin.tabActive')}</TabsTrigger>
          <TabsTrigger value="deleted">{t('usersAdmin.tabDeleted')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {viewMode === 'deleted' ? t('usersAdmin.statDeletedTotal') : t('usersAdmin.statTotal')}
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {viewMode === 'deleted' ? t('usersAdmin.statActiveDeleted') : t('usersAdmin.statActive')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data?.data.filter(u => u.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {viewMode === 'deleted' ? t('usersAdmin.statBlockedDeleted') : t('usersAdmin.statBlocked')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data?.data.filter(u => !u.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('usersAdmin.statSelected')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedUsers.size}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <SearchFilters
            onFiltersChange={handleFiltersChange}
            placeholder={viewMode === 'deleted' ? t('usersAdmin.searchDeletedPh') : t('usersAdmin.searchPh')}
          />
        </CardHeader>
      </Card>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedUsers.size === 1
                  ? t('usersAdmin.selectedOne', { count: selectedUsers.size })
                  : t('usersAdmin.selectedMany', { count: selectedUsers.size })}
              </CardTitle>
              <div className="flex items-center gap-2">
                {viewMode === 'deleted' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBulkActionType('restore');
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {t('usersAdmin.restore')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setBulkActionType('permanent');
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t('usersAdmin.permanentlyDelete')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBulkActionType('activate');
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      {t('usersAdmin.activate')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBulkActionType('block');
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Ban className="mr-1 h-4 w-4" />
                      {t('usersAdmin.block')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setBulkActionType('delete');
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t('usersAdmin.delete')}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUsers(new Set())}
                >
                  {t('usersAdmin.clear')}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {viewMode === 'deleted'
              ? t('usersAdmin.tableTitleDeleted', { total: data?.total || 0 })
              : t('usersAdmin.tableTitle', { total: data?.total || 0 })}
          </CardTitle>
          <CardDescription>
            {viewMode === 'deleted'
              ? t('usersAdmin.tableDescDeleted')
              : t('usersAdmin.tableDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left">
                      <Checkbox
                        checked={selectedUsers.size === data?.data.length && data?.data.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colUser')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colApproval')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colPhone')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colRole')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colStatus')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colEmailVerified')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colLastLogin')}</th>
                    <th className="p-4 text-left font-medium">{t('usersAdmin.colCreatedAt')}</th>
                    <th className="p-4 text-right font-medium">{t('usersAdmin.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayUsers.length > 0 ? (
                    displayUsers.map((user) => {
                      const isPending =
                        user.verificationStatus === VerificationStatus.PENDING;
                      const isRejected =
                        user.verificationStatus === VerificationStatus.REJECTED;
                      const needsAttention = isPending || isRejected;
                      return (
                    <tr
                      key={user.id}
                      className={
                        needsAttention
                          ? `border-b transition-colors ${
                              isPending
                                ? 'bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/20'
                                : 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/20'
                            }`
                          : 'border-b hover:bg-muted/50 transition-colors'
                      }
                    >
                      <td className="p-4">
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleSelectUser(user.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {needsAttention && (
                            <span
                              className={
                                isPending
                                  ? 'h-10 w-1 shrink-0 rounded-full bg-amber-500'
                                  : 'h-10 w-1 shrink-0 rounded-full bg-red-500'
                              }
                              aria-hidden
                            />
                          )}
                          <UserAvatar user={user} className="h-10 w-10" />
                          <div>
                            <p className="font-medium">{user.fullName}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {user.verificationStatus === VerificationStatus.APPROVED ? (
                          <Badge
                            variant="default"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-600"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {t('usersAdmin.approved')}
                          </Badge>
                        ) : user.verificationStatus === VerificationStatus.REJECTED ? (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldX className="h-3 w-3" />
                            {t('usersAdmin.rejected')}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            {t('usersAdmin.notApproved')}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center text-sm">
                          {user.phone ? (
                            <span className="text-muted-foreground">{user.phone}</span>
                          ) : (
                            <span className="text-muted-foreground italic">{t('usersAdmin.notProvided')}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={getRoleBadgeColor(user.role)}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={user.isActive ? 'default' : 'destructive'}>
                          {user.isActive ? t('usersAdmin.statusActive') : t('usersAdmin.statusBlocked')}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={user.isEmailVerified ? 'default' : 'outline'}>
                          {user.isEmailVerified ? t('usersAdmin.verified') : t('usersAdmin.verifyPending')}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {user.lastLoginAt
                          ? format(new Date(user.lastLoginAt), lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy', {
                              locale: lang === 'fr' ? frLocale : undefined,
                            })
                          : t('usersAdmin.never')}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {user.createdAt
                          ? format(new Date(user.createdAt), lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy', {
                              locale: lang === 'fr' ? frLocale : undefined,
                            })
                          : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>{t('usersAdmin.actions')}</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailInitialTab('profile');
                                  setDetailUserId(user.id);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t('usersAdmin.viewDetails')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailInitialTab('profile');
                                  setDetailUserId(user.id);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                {t('usersAdmin.editUser')}
                              </DropdownMenuItem>
                              {user.role === 'dentist' && !user.dentistProfile && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDetailInitialTab('clinic');
                                    setDetailUserId(user.id);
                                  }}
                                >
                                  <Building2 className="mr-2 h-4 w-4" />
                                  {t('usersAdmin.addClinic')}
                                </DropdownMenuItem>
                              )}
                              {user.role === 'dentist' && user.dentistProfile && (
                                <DropdownMenuItem
                                  onClick={() => setClinicViewUser(user)}
                                >
                                  <Building2 className="mr-2 h-4 w-4" />
                                  {t('usersAdmin.viewClinic')}
                                </DropdownMenuItem>
                              )}
                              {user.role === 'dentist' && user.dentistProfile && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDetailInitialTab('schedule');
                                    setDetailUserId(user.id);
                                  }}
                                >
                                  <Clock className="mr-2 h-4 w-4" />
                                  {t('usersAdmin.openingHours')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {viewMode !== 'deleted' && (
                                <>
                                  {user.verificationStatus !== VerificationStatus.APPROVED && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        updateApproval.mutate({
                                          id: user.id,
                                          verificationStatus: 'approved',
                                        })
                                      }
                                      className="text-emerald-600"
                                    >
                                      <ShieldCheck className="mr-2 h-4 w-4" />
                                      {t('usersAdmin.approve')}
                                    </DropdownMenuItem>
                                  )}
                                  {user.verificationStatus !== VerificationStatus.REJECTED && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        updateApproval.mutate({
                                          id: user.id,
                                          verificationStatus: 'rejected',
                                        })
                                      }
                                      className="text-red-600"
                                    >
                                      <ShieldX className="mr-2 h-4 w-4" />
                                      {t('usersAdmin.reject')}
                                    </DropdownMenuItem>
                                  )}
                                  {user.verificationStatus !== VerificationStatus.PENDING && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        updateApproval.mutate({
                                          id: user.id,
                                          verificationStatus: 'pending',
                                        })
                                      }
                                    >
                                      <ShieldAlert className="mr-2 h-4 w-4" />
                                      {t('usersAdmin.markPending')}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {viewMode === 'deleted' ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUsers(new Set([user.id]));
                                      setBulkActionType('restore');
                                      setBulkDeleteOpen(true);
                                    }}
                                    className="text-emerald-600"
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t('usersAdmin.restoreUser')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUsers(new Set([user.id]));
                                      setBulkActionType('permanent');
                                      setBulkDeleteOpen(true);
                                    }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('usersAdmin.permanentlyDelete')}
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUsers(new Set([user.id]));
                                      setBulkActionType(user.isActive ? 'block' : 'activate');
                                      setBulkDeleteOpen(true);
                                    }}
                                  >
                                    {user.isActive ? (
                                      <>
                                        <Ban className="mr-2 h-4 w-4" />
                                        {t('usersAdmin.blockUser')}
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        {t('usersAdmin.activateUser')}
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUsers(new Set([user.id]));
                                      setBulkActionType('delete');
                                      setBulkDeleteOpen(true);
                                    }}
                                    className="text-orange-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('usersAdmin.deleteUser')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-8 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <UsersIcon className="h-12 w-12 mb-4 opacity-50" />
                          <p className="text-lg font-medium">
                            {viewMode === 'deleted' ? t('usersAdmin.emptyDeleted') : t('usersAdmin.emptyActive')}
                          </p>
                          <p className="text-sm">{t('usersAdmin.emptyHint')}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                {t('usersAdmin.pagShowing', {
                  from: ((page - 1) * limit) + 1,
                  to: Math.min(page * limit, data.total),
                  total: data.total,
                })}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('usersAdmin.previous')}
                </Button>
                <div className="flex items-center space-x-1">
                  {[...Array(data.totalPages)].map((_, i) => (
                    <Button
                      key={i}
                      variant={page === i + 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(i + 1)}
                      className="w-8 h-8"
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(data.totalPages, page + 1))}
                  disabled={page === data.totalPages}
                >
                  {t('usersAdmin.next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      {detailUserId && (
        <UserDetailSheet
          userId={detailUserId}
          open={!!detailUserId}
          onOpenChange={(open) => !open && setDetailUserId(null)}
          initialTab={detailInitialTab}
        />
      )}
      {clinicViewUser?.dentistProfile && (
        <ClinicViewDialog
          open={!!clinicViewUser}
          onOpenChange={(open) => !open && setClinicViewUser(null)}
          profile={clinicViewUser.dentistProfile}
          dentistName={clinicViewUser.fullName}
        />
      )}

      {/* Bulk Action Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkActionType === 'delete'
                ? t('usersAdmin.bulkDeleteTitle')
                : bulkActionType === 'restore'
                  ? t('usersAdmin.bulkRestoreTitle')
                : bulkActionType === 'permanent'
                  ? t('usersAdmin.bulkPermanentTitle')
                : bulkActionType === 'block'
                  ? t('usersAdmin.bulkBlockTitle')
                  : t('usersAdmin.bulkActivateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const actionKey =
                  bulkActionType === 'delete'
                    ? 'usersAdmin.bulkActionDelete'
                    : bulkActionType === 'restore'
                      ? 'usersAdmin.bulkActionRestore'
                    : bulkActionType === 'permanent'
                      ? 'usersAdmin.bulkActionPermanent'
                    : bulkActionType === 'block'
                      ? 'usersAdmin.bulkActionBlock'
                      : 'usersAdmin.bulkActionActivate';
                const actionLabel = t(actionKey);
                const baseTpl =
                  selectedUsers.size === 1
                    ? 'usersAdmin.bulkConfirmOne'
                    : 'usersAdmin.bulkConfirmMany';
                const main = t(baseTpl, { action: actionLabel, count: selectedUsers.size });
                const irreversible =
                  bulkActionType === 'delete' || bulkActionType === 'permanent'
                    ? t('usersAdmin.bulkIrreversible')
                    : '';
                const permanentNote =
                  bulkActionType === 'permanent' ? t('usersAdmin.bulkPermanentNote') : '';
                return `${main}${irreversible}${permanentNote}`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkActionType(null)}>
              {t('usersAdmin.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkActionType && handleBulkAction(bulkActionType)}
              className={bulkActionType === 'permanent' ? 'bg-red-700 hover:bg-red-800' : bulkActionType === 'delete' ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              {bulkActionType === 'delete'
                ? t('usersAdmin.btnDelete')
                : bulkActionType === 'restore'
                  ? t('usersAdmin.btnRestore')
                : bulkActionType === 'permanent'
                  ? t('usersAdmin.btnPermanent')
                : bulkActionType === 'block'
                  ? t('usersAdmin.btnBlock')
                  : t('usersAdmin.btnActivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
