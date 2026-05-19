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

export function UsersPageContent() {
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
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">Manage system users and their roles</p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add User
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
            <h2 className="text-2xl font-bold text-red-600">Error</h2>
            <p className="text-muted-foreground mt-2">Failed to load users</p>
            <p className="text-sm text-red-500 mt-1">{error.message}</p>
            <Button 
              onClick={() => refetch()} 
              className="mt-4"
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
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
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage system users and their roles</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Pending-approval banner — surfaces the count up top so admins
          can scan even before they look at the table. */}
      {viewMode === 'active' && pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              {pendingCount} user{pendingCount === 1 ? '' : 's'} awaiting approval
            </span>
            <span className="ml-1 text-amber-700/80 dark:text-amber-300/80">
              — they're listed at the top of the table.
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
          <TabsTrigger value="active">Active Users</TabsTrigger>
          <TabsTrigger value="deleted">Deleted Users</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {viewMode === 'deleted' ? 'Deleted Users' : 'Total Users'}
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
              {viewMode === 'deleted' ? 'Active (deleted)' : 'Active Users'}
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
              {viewMode === 'deleted' ? 'Blocked (deleted)' : 'Blocked Users'}
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
            <CardTitle className="text-sm font-medium">Selected</CardTitle>
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
            placeholder={viewMode === 'deleted' ? 'Search deleted users...' : 'Search by name or email...'}
          />
        </CardHeader>
      </Card>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedUsers.size} user{selectedUsers.size > 1 ? 's' : ''} selected
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
                      Restore
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
                      Permanently Delete
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
                      Activate
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
                      Block
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
                      Delete
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUsers(new Set())}
                >
                  Clear
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
            {viewMode === 'deleted' ? 'Deleted Users' : 'Users'} ({data?.total || 0})
          </CardTitle>
          <CardDescription>
            {viewMode === 'deleted'
              ? 'A list of deleted users. You can restore or permanently delete them.'
              : 'A list of all users in the system with their details and status.'}
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
                    <th className="p-4 text-left font-medium">User</th>
                    <th className="p-4 text-left font-medium">Approval</th>
                    <th className="p-4 text-left font-medium">Phone</th>
                    <th className="p-4 text-left font-medium">Role</th>
                    <th className="p-4 text-left font-medium">Status</th>
                    <th className="p-4 text-left font-medium">Email Verified</th>
                    <th className="p-4 text-left font-medium">Last Login</th>
                    <th className="p-4 text-right font-medium">Actions</th>
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
                            Approved
                          </Badge>
                        ) : user.verificationStatus === VerificationStatus.REJECTED ? (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldX className="h-3 w-3" />
                            Rejected
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            Not approved
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center text-sm">
                          {user.phone ? (
                            <span className="text-muted-foreground">{user.phone}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Not provided</span>
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
                          {user.isActive ? 'Active' : 'Blocked'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={user.isEmailVerified ? 'default' : 'outline'}>
                          {user.isEmailVerified ? 'Verified' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MMM d, yyyy') : 'Never'}
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
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailInitialTab('profile');
                                  setDetailUserId(user.id);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailInitialTab('profile');
                                  setDetailUserId(user.id);
                                }}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit User
                              </DropdownMenuItem>
                              {user.role === 'dentist' && !user.dentistProfile && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDetailInitialTab('clinic');
                                    setDetailUserId(user.id);
                                  }}
                                >
                                  <Building2 className="mr-2 h-4 w-4" />
                                  Add Clinic
                                </DropdownMenuItem>
                              )}
                              {user.role === 'dentist' && user.dentistProfile && (
                                <DropdownMenuItem
                                  onClick={() => setClinicViewUser(user)}
                                >
                                  <Building2 className="mr-2 h-4 w-4" />
                                  View Clinic
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
                                  Opening Hours
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
                                      Approve
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
                                      Reject
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
                                      Mark as pending
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
                                    Restore User
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
                                    Permanently Delete
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
                                        Block User
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Activate User
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
                                    Delete User
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
                      <td colSpan={9} className="p-8 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <UsersIcon className="h-12 w-12 mb-4 opacity-50" />
                          <p className="text-lg font-medium">
                            {viewMode === 'deleted' ? 'No deleted users found' : 'No users found'}
                          </p>
                          <p className="text-sm">Try adjusting your search or filter criteria</p>
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
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.total)} of {data.total} results
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
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
                  Next
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
                ? 'Delete Users' 
                : bulkActionType === 'restore'
                  ? 'Restore Users'
                : bulkActionType === 'permanent'
                  ? 'Permanently Delete Users'
                : bulkActionType === 'block' 
                  ? 'Block Users' 
                  : 'Activate Users'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkActionType === 'permanent' ? 'permanently delete' : bulkActionType} {selectedUsers.size} user{selectedUsers.size > 1 ? 's' : ''}?
              {(bulkActionType === 'delete' || bulkActionType === 'permanent') && ' This action cannot be undone.'}
              {bulkActionType === 'permanent' && ' The user data will be permanently removed from the database.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkActionType(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkActionType && handleBulkAction(bulkActionType)}
              className={bulkActionType === 'permanent' ? 'bg-red-700 hover:bg-red-800' : bulkActionType === 'delete' ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              {bulkActionType === 'delete' 
                ? 'Delete' 
                : bulkActionType === 'restore'
                  ? 'Restore'
                : bulkActionType === 'permanent'
                  ? 'Permanently Delete'
                : bulkActionType === 'block' 
                  ? 'Block' 
                  : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
