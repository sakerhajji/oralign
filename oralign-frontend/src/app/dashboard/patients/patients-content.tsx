'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, Trash2, UserRound, X } from 'lucide-react';
import {
  PatientConfirmDialogs,
  type PatientConfirm,
} from '@/components/patients/patient-confirm-dialogs';
import { PatientPanel } from '@/components/patients/patient-panel';
import type { PatientSubmitPayload } from '@/components/patients/patient-form-sheet';
import {
  PatientsList,
  PatientsListSkeleton,
  type PatientAction,
} from '@/components/patients/patients-list';
import {
  EMPTY_PATIENTS_FILTERS,
  PATIENTS_PAGE_SIZE,
  hasActiveFilters,
  patientsUrlSearch,
  readPatientsUrlState,
  sameFilters,
  toBaseFilterParams,
  withView,
  type PatientsFilters,
  type PatientsView,
} from '@/components/patients/patients-filters';
import { PatientsToolbar, type ViewTotals } from '@/components/patients/patients-toolbar';
import { ListPagination } from '@/components/shared/list-pagination';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBulkDeletePatients,
  useCreatePatient,
  useDeletePatient,
  useDentistOptions,
  usePatient,
  usePatients,
  usePatientTotals,
  usePermanentDeletePatient,
  useRestorePatient,
  useUpdatePatient,
  useUploadPatientProfilePhoto,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import type { Patient, PatientListItem } from '@/lib/types';

// The form is only needed on create / edit: its chunk loads on demand
// (warmed when the page is idle) and it mounts on first use.
const loadPatientFormSheet = () => import('@/components/patients/patient-form-sheet');
const PatientFormSheet = dynamic(
  () => loadPatientFormSheet().then((module) => ({ default: module.PatientFormSheet })),
  { ssr: false },
);

const NO_ROWS: PatientListItem[] = [];
const NO_DENTISTS: { id: string; fullName: string }[] = [];

/**
 * The patient book. Waits for the signed-in user (the role decides the
 * columns, the trash and which URL params count), so a hard reload never
 * flashes the "no access" card.
 */
export function PatientsPageContent() {
  const { user, isAdmin, isDentist } = useAuth();
  if (!user) return <PatientsPageSkeleton />;
  if (!isAdmin && !isDentist) return <NoAccess />;
  return <PatientsDesk isAdmin={isAdmin} userId={user.id} />;
}

function PatientsDesk({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── List state: React owns it, the URL mirrors it ────────────────
  const [initial] = useState(() => readPatientsUrlState(searchParams, { isAdmin }));
  const [view, setView] = useState<PatientsView>(initial.view);
  const [filters, setFilters] = useState<PatientsFilters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [searchKey, setSearchKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const listTopRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const search = patientsUrlSearch({ view, page, filters }, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [view, page, filters, pathname]);

  const changeFilters = (patch: Partial<PatientsFilters>) => {
    const next = { ...filters, ...patch };
    if (sameFilters(next, filters)) return;
    setFilters(next);
    setPage(1);
    setSelected(new Set());
  };
  const clearFilters = () => {
    setFilters({ ...EMPTY_PATIENTS_FILTERS, sort: filters.sort });
    setSearchKey((key) => key + 1);
    setPage(1);
    setSelected(new Set());
  };
  const changeView = (next: PatientsView) => {
    if (next === view) return;
    setView(next);
    setPage(1);
    setSelected(new Set());
  };
  const goToPage = (next: number) => {
    setPage(next);
    setSelected(new Set());
    const top = listTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // ── Data ─────────────────────────────────────────────────────────
  const base = useMemo(() => toBaseFilterParams(filters, { isAdmin }), [filters, isAdmin]);
  const list = usePatients(
    useMemo(
      () => ({ ...withView(base, view), page, limit: PATIENTS_PAGE_SIZE }),
      [base, view, page],
    ),
  );
  const views: PatientsView[] = useMemo(
    () => (isAdmin ? ['all', 'active', 'none', 'trash'] : ['all', 'active', 'none']),
    [isAdmin],
  );
  // The tab totals follow the search and filters, never the sort.
  const totalsList = usePatientTotals(
    useMemo(() => {
      const counted = { ...base };
      delete counted.sortBy;
      delete counted.sortOrder;
      return views.map((tab) => withView(counted, tab));
    }, [base, views]),
  );
  const totals: ViewTotals = Object.fromEntries(
    views.map((tab, index) => [tab, totalsList[index]]),
  );
  // The open tab shows the total of the rows on screen, so the two can
  // never disagree while one of them refreshes.
  if (list.data && !list.isPlaceholderData) totals[view] = list.data.total;
  const dentists = useDentistOptions({ enabled: isAdmin });

  const rows = list.data?.data ?? NO_ROWS;
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, list.data?.totalPages ?? 1);
  const refreshing = list.isPlaceholderData;
  const inTrash = view === 'trash';
  const filtered = hasActiveFilters(filters);

  // A page past the end (rows trashed, filters narrowed) snaps back once
  // real data has arrived, instead of showing an empty page.
  if (list.data && !list.isPlaceholderData && page > totalPages) {
    setPage(totalPages);
  }

  // ── The open patient lives in the URL (Back closes the panel) ────
  const patientId = searchParams.get('patient');
  const pushedRef = useRef(false);
  const rowPatient = patientId ? rows.find((row) => row.id === patientId) : undefined;
  // Opened from a link and not on this page: fetch it (trashed patients
  // are only ever opened from their row, the API hides them).
  const fetched = usePatient(patientId && !rowPatient && !inTrash ? patientId : '');
  const panelPatient: Patient | null =
    rowPatient ?? (patientId && fetched.data?.id === patientId ? fetched.data : null);
  // Where an order opened from the panel returns: this list, panel open.
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(patientsUrlSearch({ view, page, filters }, ''));
    if (patientId) params.set('patient', patientId);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }, [filters, page, pathname, patientId, view]);

  const openPatient = useCallback(
    (patient: Pick<Patient, 'id'>) => {
      const params = new URLSearchParams(window.location.search);
      params.set('patient', patient.id);
      window.history.pushState(null, '', `${pathname}?${params}`);
      pushedRef.current = true;
    },
    [pathname],
  );
  const closePatient = useCallback(() => {
    // Opened by a click on this page: going back restores the list's URL
    // and keeps Back / Forward symmetrical. Opened from a link: drop it.
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete('patient');
    const query = params.toString();
    window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}`);
  }, [pathname]);

  useEffect(() => {
    // Closed by the browser's Back: nothing left to pop.
    if (!patientId) pushedRef.current = false;
  }, [patientId]);
  useEffect(() => {
    // A link to a patient this account cannot open: just close it.
    if (patientId && fetched.isError) closePatient();
  }, [patientId, fetched.isError, closePatient]);

  // ── Mutations ────────────────────────────────────────────────────
  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const uploadPhoto = useUploadPatientProfilePhoto();
  const trashPatient = useDeletePatient();
  const restorePatient = useRestorePatient();
  const purgePatient = usePermanentDeletePatient();
  const bulkTrash = useBulkDeletePatients();
  const saving = createPatient.isPending || updatePatient.isPending || uploadPhoto.isPending;
  const acting = trashPatient.isPending || restorePatient.isPending || purgePatient.isPending;

  const [form, setForm] = useState<{ open: boolean; patient: Patient | null }>({
    open: false,
    patient: null,
  });
  // Mounted from the first opening on, so its close animation can play.
  const [formMounted, setFormMounted] = useState(false);
  if (form.open && !formMounted) setFormMounted(true);

  useEffect(() => {
    const preload = () => void loadPatientFormSheet();
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 2500);
    return () => window.clearTimeout(timer);
  }, []);
  const [confirm, setConfirm] = useState<PatientConfirm>(null);

  const closeForm = () => setForm((current) => ({ ...current, open: false }));
  const handleSubmit = (payload: PatientSubmitPayload, photo: File | null) => {
    const finish = (saved: Patient) => {
      if (photo) {
        // The patient exists from here on: a failed upload leaves the
        // form open in EDIT mode, so the retry uploads the photo instead
        // of creating the patient a second time.
        setForm({ open: true, patient: saved });
        uploadPhoto.mutate(
          { id: saved.id, file: photo },
          { onSuccess: closeForm },
        );
      } else {
        closeForm();
      }
      // A new patient opens straight away, ready for a first order.
      if (payload.mode === 'create') openPatient(saved);
    };
    if (payload.mode === 'edit' && form.patient) {
      updatePatient.mutate({ id: form.patient.id, data: payload.data }, { onSuccess: finish });
    } else if (payload.mode === 'create') {
      createPatient.mutate(payload.data, { onSuccess: finish });
    }
  };

  const forget = (id: string) => {
    setSelected((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (patientId === id) closePatient();
  };

  const runAction = (patient: Patient, action: PatientAction) => {
    switch (action) {
      case 'edit':
        setForm({ open: true, patient });
        break;
      case 'new-order':
        router.push(`/dashboard/orders/new?patientId=${encodeURIComponent(patient.id)}`);
        break;
      case 'trash':
        setConfirm({ kind: 'trash', patient });
        break;
      case 'permanent':
        setConfirm({ kind: 'permanent', patient });
        break;
      case 'restore':
        restorePatient.mutate(patient.id, { onSuccess: () => forget(patient.id) });
        break;
    }
  };

  // ── Selection (the table's bulk trash) ───────────────────────────
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((current) => {
      const allOn = rows.length > 0 && rows.every((row) => current.has(row.id));
      const next = new Set(current);
      rows.forEach((row) => (allOn ? next.delete(row.id) : next.add(row.id)));
      return next;
    });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <PatientsPageFrame>
      <PatientsHeader onCreate={() => setForm({ open: true, patient: null })} />

      <PatientsToolbar
        view={view}
        onViewChange={changeView}
        totals={totals}
        filters={filters}
        onFiltersChange={changeFilters}
        isAdmin={isAdmin}
        dentists={dentists.data?.data ?? NO_DENTISTS}
        dentistsLoading={isAdmin && dentists.isPending}
        busy={refreshing}
        searchKey={searchKey}
        canClear={filtered}
        onClear={clearFilters}
      />

      <section ref={listTopRef} className="flex scroll-mt-4 flex-col gap-3">
        {selected.size > 0 && !inTrash && (
          <div className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm lg:flex">
            <span className="font-medium tabular-nums">
              {t(
                selected.size === 1
                  ? 'patientDesk.bulk.selectedOne'
                  : 'patientDesk.bulk.selectedMany',
                { count: selected.size },
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X aria-hidden="true" />
              {t('patientDesk.bulk.deselect')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={bulkTrash.isPending}
              onClick={() => setConfirm({ kind: 'bulk', ids: [...selected] })}
            >
              <Trash2 aria-hidden="true" />
              {t('patientDesk.bulk.trash')}
            </Button>
          </div>
        )}

        {list.isPending ? (
          <PatientsListSkeleton />
        ) : list.isError && !list.data ? (
          <ListMessage
            icon={<UserRound />}
            title={t('patientDesk.empty.errorTitle')}
            detail={list.error.message}
            action={
              <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                <RefreshCw aria-hidden="true" />
                {t('patientDesk.empty.retry')}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyList
            view={view}
            filtered={filtered}
            onClear={clearFilters}
            onCreate={() => setForm({ open: true, patient: null })}
          />
        ) : (
          <PatientsList
            patients={rows}
            inTrash={inTrash}
            isAdmin={isAdmin}
            activeId={patientId}
            selected={selected}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            onOpen={openPatient}
            onAction={runAction}
            busy={refreshing}
          />
        )}

        <ListPagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          total={total}
          pageSize={PATIENTS_PAGE_SIZE}
          onPageChange={goToPage}
        />
      </section>

      <PatientPanel
        patient={panelPatient}
        open={!!patientId && !!panelPatient}
        onOpenChange={(open) => {
          if (!open) closePatient();
        }}
        inTrash={inTrash}
        isAdmin={isAdmin}
        returnTo={returnTo}
        onEdit={(patient) => setForm({ open: true, patient })}
        onNewOrder={(patient) => runAction(patient, 'new-order')}
        onTrash={(patient) => setConfirm({ kind: 'trash', patient })}
        onRestore={(patient) => runAction(patient, 'restore')}
        onPermanentDelete={(patient) => setConfirm({ kind: 'permanent', patient })}
        pending={acting}
      />

      {formMounted && (
        <PatientFormSheet
          open={form.open}
          onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
          patient={form.patient}
          isAdmin={isAdmin}
          currentUserId={userId}
          dentists={dentists.data?.data ?? NO_DENTISTS}
          isSaving={saving}
          onSubmit={handleSubmit}
        />
      )}

      <PatientConfirmDialogs
        confirm={confirm}
        onClose={() => setConfirm(null)}
        isAdmin={isAdmin}
        purging={purgePatient.isPending}
        onTrash={(patient) =>
          trashPatient.mutate(patient.id, { onSuccess: () => forget(patient.id) })
        }
        onBulkTrash={(ids) =>
          bulkTrash.mutate(ids, { onSuccess: () => setSelected(new Set()) })
        }
        onPurge={(patient) =>
          purgePatient.mutate(patient.id, {
            onSuccess: () => {
              setConfirm(null);
              forget(patient.id);
            },
          })
        }
      />
    </PatientsPageFrame>
  );
}

// ─── Frame, header, messages ────────────────────────────────────────

function PatientsPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      {/* Bottom room on phones: the support bubble floats there. */}
      <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-24 md:gap-5 md:pt-6 md:pb-8 lg:px-6">
        {children}
      </div>
    </div>
  );
}

function PatientsHeader({ onCreate }: { onCreate?: () => void }) {
  const { t } = useT();
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('patientDesk.title')}
      </h1>
      {onCreate && (
        <Button onClick={onCreate} className="h-9">
          <Plus aria-hidden="true" />
          {t('patientDesk.actions.newPatient')}
        </Button>
      )}
    </header>
  );
}

function EmptyList({
  view,
  filtered,
  onClear,
  onCreate,
}: {
  view: PatientsView;
  filtered: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  const { t } = useT();
  if (filtered) {
    return (
      <ListMessage
        icon={<UserRound />}
        title={t('patientDesk.empty.filteredTitle')}
        detail={t('patientDesk.empty.filteredBody')}
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            <X aria-hidden="true" />
            {t('patientDesk.filters.clear')}
          </Button>
        }
      />
    );
  }
  switch (view) {
    case 'active':
      return (
        <ListMessage
          icon={<UserRound />}
          title={t('patientDesk.empty.activeTitle')}
          detail={t('patientDesk.empty.activeBody')}
        />
      );
    case 'none':
      return (
        <ListMessage
          icon={<UserRound />}
          title={t('patientDesk.empty.noneTitle')}
          detail={t('patientDesk.empty.noneBody')}
        />
      );
    case 'trash':
      return (
        <ListMessage
          icon={<Trash2 />}
          title={t('patientDesk.empty.trashTitle')}
          detail={t('patientDesk.empty.trashBody')}
        />
      );
    default:
      return (
        <ListMessage
          icon={<UserRound />}
          title={t('patientDesk.empty.firstTitle')}
          detail={t('patientDesk.empty.firstBody')}
          action={
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden="true" />
              {t('patientDesk.actions.newPatient')}
            </Button>
          }
        />
      );
  }
}

/** An empty or failed list: keeps the list's frame, one sentence, one action. */
function ListMessage({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      <span className="text-muted-foreground [&>svg]:size-6" aria-hidden="true">
        {icon}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="max-w-md text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function NoAccess() {
  const { t } = useT();
  return (
    <PatientsPageFrame>
      <PatientsHeader />
      <ListMessage
        icon={<UserRound />}
        title={t('patientDesk.noAccess.title')}
        detail={t('patientDesk.noAccess.body')}
      />
    </PatientsPageFrame>
  );
}

/** The page's own layout with grey bars, before the user (or the URL) is known. */
export function PatientsPageSkeleton() {
  return (
    <PatientsPageFrame>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-4 border-b pb-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex flex-col gap-2 xl:flex-row">
          <Skeleton className="h-9 w-full rounded-lg xl:max-w-md" />
          <div className="grid grid-cols-2 gap-2 sm:flex xl:ml-auto">
            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-36" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
          </div>
        </div>
      </div>
      <PatientsListSkeleton />
    </PatientsPageFrame>
  );
}
