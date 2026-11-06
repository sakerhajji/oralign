'use client';

import type { MouseEvent } from 'react';
import {
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';
import type { PatientListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
// Days as Tunis business days, as the "date added" filter counts them.
import { formatBusinessDay } from '@/lib/utils/business-day';
import { formatPhone } from '@/lib/utils/phone';
import { PatientAvatar } from './patient-avatar';
import { patientFacts } from './patient-format';

export type PatientAction = 'edit' | 'new-order' | 'trash' | 'restore' | 'permanent';

interface PatientsListProps {
  patients: PatientListItem[];
  inTrash: boolean;
  isAdmin: boolean;
  /** The patient whose panel is open. */
  activeId: string | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (patient: PatientListItem) => void;
  onAction: (patient: PatientListItem, action: PatientAction) => void;
  /** A newer result set is loading behind these rows. */
  busy: boolean;
}

// Fixed widths: the patient column takes the rest and truncates.
const COLS = {
  select: 'w-11 pl-4',
  contact: 'w-56',
  record: 'w-64',
  dentist: 'hidden w-44 xl:table-cell',
  date: 'hidden w-32 xl:table-cell',
  actions: 'w-14 pr-3',
};

/**
 * The patient book: a table from lg up, two-line rows below. Both are
 * rendered and CSS picks one (no flash while a media query settles).
 * A row opens the patient panel; bulk selection lives in the table only.
 */
export function PatientsList(props: PatientsListProps) {
  const { busy } = props;
  return (
    <div
      aria-busy={busy || undefined}
      className={cn('transition-opacity duration-150', busy && 'opacity-60')}
    >
      <PatientsTable {...props} />
      <PatientsRows {...props} />
    </div>
  );
}

// ─── Table (lg and up) ──────────────────────────────────────────────

function PatientsTable({
  patients,
  inTrash,
  isAdmin,
  activeId,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onAction,
}: PatientsListProps) {
  const { t } = useT();
  const selectable = !inTrash;
  const selectedOnPage = patients.filter((patient) => selected.has(patient.id)).length;
  const allSelected = patients.length > 0 && selectedOnPage === patients.length;

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b">
          <tr className="text-left text-xs text-muted-foreground">
            {selectable && (
              <th className={cn('h-10 px-2', COLS.select)}>
                <Checkbox
                  checked={allSelected ? true : selectedOnPage > 0 ? 'indeterminate' : false}
                  onCheckedChange={onToggleAll}
                  aria-label={t('patientDesk.list.selectPageAria')}
                />
              </th>
            )}
            <th className={cn('h-10 px-2 font-medium', !selectable && 'pl-4')}>
              {t('patientDesk.list.colPatient')}
            </th>
            <th className={cn('h-10 px-2 font-medium', COLS.contact)}>
              {t('patientDesk.list.colContact')}
            </th>
            <th className={cn('h-10 px-2 font-medium', COLS.record)}>
              {t('patientDesk.list.colRecord')}
            </th>
            {isAdmin && (
              <th className={cn('h-10 px-2 font-medium', COLS.dentist)}>
                {t('patientDesk.list.colDentist')}
              </th>
            )}
            <th className={cn('h-10 px-2 font-medium', COLS.date)}>
              {inTrash ? t('patientDesk.list.colTrashed') : t('patientDesk.list.colAdded')}
            </th>
            <th className={COLS.actions}>
              <span className="sr-only">{t('patientDesk.list.colActions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <PatientTableRow
              key={patient.id}
              patient={patient}
              inTrash={inTrash}
              isAdmin={isAdmin}
              active={patient.id === activeId}
              selectable={selectable}
              checked={selected.has(patient.id)}
              onToggle={onToggle}
              onOpen={onOpen}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A click anywhere on the row opens the patient, except on its own
 * controls. Menu items render in a portal: React still bubbles their
 * clicks here, so anything outside the row's DOM is ignored too.
 */
function opensRow(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element;
  if (!event.currentTarget.contains(target)) return false;
  return !target.closest('button, a, input, label, [role="checkbox"], [role="menuitem"]');
}

function PatientTableRow({
  patient,
  inTrash,
  isAdmin,
  active,
  selectable,
  checked,
  onToggle,
  onOpen,
  onAction,
}: {
  patient: PatientListItem;
  inTrash: boolean;
  isAdmin: boolean;
  active: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (patient: PatientListItem) => void;
  onAction: (patient: PatientListItem, action: PatientAction) => void;
}) {
  const { t, lang } = useT();
  const shownDate = inTrash ? patient.deletedAt : patient.createdAt;

  return (
    <tr
      data-state={active ? 'active' : checked ? 'selected' : undefined}
      onClick={(event) => {
        if (opensRow(event)) onOpen(patient);
      }}
      className="cursor-pointer border-b last:border-0 hover:bg-muted/40 data-[state=active]:bg-muted data-[state=selected]:bg-muted/60"
    >
      {selectable && (
        <td className={cn('px-2 py-2.5 align-middle', COLS.select)}>
          <Checkbox
            checked={checked}
            onCheckedChange={() => onToggle(patient.id)}
            aria-label={t('patientDesk.list.selectAria', { name: patient.fullName })}
          />
        </td>
      )}
      <td className={cn('px-2 py-2.5 align-middle', !selectable && 'pl-4')}>
        <div className="flex min-w-0 items-center gap-3">
          <PatientAvatar patient={patient} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(patient)}
              className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {patient.fullName}
            </button>
            <p className="truncate text-xs text-muted-foreground">
              {patientFacts(patient, t) ?? '—'}
            </p>
          </div>
        </div>
      </td>
      <td className={cn('px-2 py-2.5 align-middle', COLS.contact)}>
        <PatientContact patient={patient} />
      </td>
      <td className={cn('px-2 py-2.5 align-middle', COLS.record)}>
        <PatientRecord patient={patient} />
      </td>
      {isAdmin && (
        <td className={cn('truncate px-2 py-2.5 align-middle', COLS.dentist)}>
          {patient.doctor?.fullName ?? <Dash />}
        </td>
      )}
      <td
        className={cn(
          'px-2 py-2.5 align-middle text-muted-foreground tabular-nums',
          COLS.date,
        )}
      >
        {shownDate ? formatBusinessDay(shownDate, lang) : <Dash />}
      </td>
      <td className={cn('py-2.5 text-right align-middle', COLS.actions)}>
        <PatientRowMenu
          patient={patient}
          inTrash={inTrash}
          isAdmin={isAdmin}
          onAction={onAction}
        />
      </td>
    </tr>
  );
}

// ─── Rows (below lg) ────────────────────────────────────────────────

/**
 * The name gets the whole first line (a long status beside it used to
 * squeeze it to "Nour El …"); the case status leads the second line, so
 * the statuses still read down one edge. The phone number joins from sm
 * up, where there is room for it.
 */
function PatientsRows({ patients, inTrash, activeId, onOpen }: PatientsListProps) {
  const { t, lang } = useT();
  return (
    <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:hidden">
      {patients.map((patient) => (
        <li key={patient.id}>
          <button
            type="button"
            onClick={() => onOpen(patient)}
            data-state={patient.id === activeId ? 'active' : undefined}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:bg-muted/60 data-[state=active]:bg-muted"
          >
            <PatientAvatar patient={patient} className="size-10" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-5 font-medium">
                {patient.fullName}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {!inTrash && patient.latestOrder && (
                  <OrderStatusBadge status={patient.latestOrder.status} />
                )}
                <span className="truncate">
                  {rowSubline(patient, inTrash, t)}
                </span>
              </span>
            </span>
            {inTrash ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {patient.deletedAt ? formatBusinessDay(patient.deletedAt, lang) : ''}
              </span>
            ) : patient.phone ? (
              <span className="hidden shrink-0 text-sm text-muted-foreground tabular-nums sm:block">
                {formatPhone(patient.phone)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Cells ──────────────────────────────────────────────────────────

/**
 * The row's second line after the status badge: age and sex, led by
 * "no order yet" when there is no case to show a badge for.
 */
function rowSubline(
  patient: PatientListItem,
  inTrash: boolean,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string {
  const facts = patientFacts(patient, t);
  if (inTrash || patient.latestOrder) return facts ?? '';
  const noOrder = t('patientDesk.list.noOrder');
  return facts ? `${noOrder} · ${facts}` : noOrder;
}

function PatientContact({ patient }: { patient: PatientListItem }) {
  return (
    <div className="min-w-0">
      <p className="truncate tabular-nums">
        {patient.phone ? formatPhone(patient.phone) : <Dash />}
      </p>
      {patient.email && (
        <p className="truncate text-xs text-muted-foreground">{patient.email}</p>
      )}
    </div>
  );
}

/** The case: the newest order's status, its code and how many there are. */
function PatientRecord({ patient }: { patient: PatientListItem }) {
  const { t } = useT();
  const { latestOrder, ordersCount } = patient;
  if (!latestOrder) return <NoOrderLabel />;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <OrderStatusBadge status={latestOrder.status} />
      <p className="max-w-full truncate text-xs text-muted-foreground">
        {latestOrder.orderCode}
        {ordersCount > 1 && ` · ${t('patientDesk.list.ordersMany', { count: ordersCount })}`}
      </p>
    </div>
  );
}

function NoOrderLabel() {
  const { t } = useT();
  return <span className="text-xs text-muted-foreground">{t('patientDesk.list.noOrder')}</span>;
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

// ─── Row menu ───────────────────────────────────────────────────────

function PatientRowMenu({
  patient,
  inTrash,
  isAdmin,
  onAction,
}: {
  patient: PatientListItem;
  inTrash: boolean;
  isAdmin: boolean;
  onAction: (patient: PatientListItem, action: PatientAction) => void;
}) {
  const { t } = useT();
  // The backend refuses to trash a patient who still has orders.
  const hasOrders = patient.ordersCount > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('patientDesk.list.actionsAria', { name: patient.fullName })}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {inTrash ? (
          <>
            <DropdownMenuItem onSelect={() => onAction(patient, 'restore')}>
              <ArchiveRestore aria-hidden="true" />
              {t('patientDesk.actions.restore')}
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onAction(patient, 'permanent')}
              >
                <ShieldX aria-hidden="true" />
                {t('patientDesk.actions.deletePermanently')}
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onAction(patient, 'new-order')}>
              <Plus aria-hidden="true" />
              {t('patientDesk.actions.newOrder')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(patient, 'edit')}>
              <Pencil aria-hidden="true" />
              {t('patientDesk.actions.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={hasOrders}
              onSelect={() => onAction(patient, 'trash')}
              className="items-start"
            >
              <Trash2 aria-hidden="true" className="mt-0.5" />
              <span className="flex flex-col">
                {t('patientDesk.actions.trash')}
                {hasOrders && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('patientDesk.actions.trashBlocked')}
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Loading ────────────────────────────────────────────────────────

/** The final layout with grey bars at the values' real sizes. */
export function PatientsListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
        <div className="h-10 border-b" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[61px] items-center gap-3 border-b px-4 last:border-0">
            <Skeleton className="size-4 rounded-[4px]" />
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="ml-6 h-5 w-24 rounded-full" />
            <Skeleton className="ml-10 size-8 rounded-lg" />
          </div>
        ))}
      </div>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:hidden">
        {Array.from({ length: Math.min(rows, 6) }, (_, index) => (
          <li key={index} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
