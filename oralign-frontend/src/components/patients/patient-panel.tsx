'use client';

import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArchiveRestore,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { conditionLabel } from '@/lib/chief-complaint';
import { usePatientOrders } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { buildOrderNavigationHref } from '@/lib/orders/order-navigation';
import { CLINICAL_CONDITION_OTHER, type Patient, type PatientListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
// Days as Tunis business days, as the "date added" filter counts them.
import { formatBusinessDay } from '@/lib/utils/business-day';
import { formatPhone, phoneHref } from '@/lib/utils/phone';
import { PatientAvatar } from './patient-avatar';
import { formatDateOfBirth, genderLabelKey, patientAge, patientFacts } from './patient-format';

type PanelPatient = Patient | PatientListItem;

export interface PatientPanelProps {
  /** The patient to show; null while nothing is selected. */
  patient: PanelPatient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inTrash: boolean;
  isAdmin: boolean;
  /** Where an opened order's "back" should return (this page, panel open). */
  returnTo: string;
  onEdit: (patient: PanelPatient) => void;
  onNewOrder: (patient: PanelPatient) => void;
  onTrash: (patient: PanelPatient) => void;
  onRestore: (patient: PanelPatient) => void;
  onPermanentDelete: (patient: PanelPatient) => void;
  /** An action on this patient is running (buttons wait). */
  pending: boolean;
}

const PHONE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Phone or wide layout, or null until known: the server can't tell, and
 * guessing would mount the side panel first and swap it for the bottom
 * sheet a frame later on a phone opened from a link.
 */
function usePhoneLayout(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => null,
  );
}

/**
 * One patient: their orders first (the reason to open them), then their
 * contact, profile, clinical record and notes, with the two things done
 * from here — edit, start an order — pinned at the foot.
 *
 * A side panel on wide screens, a bottom sheet on phones (drag down, tap
 * outside or Back to close: the page keeps the patient in the URL).
 */
export function PatientPanel(props: PatientPanelProps) {
  const { patient, open, onOpenChange } = props;
  const phone = usePhoneLayout();

  // Keep showing the last patient while the panel animates closed (the
  // URL, and so `patient`, clears on the first frame of the close).
  const [shown, setShown] = useState(patient);
  if (patient && patient !== shown) setShown(patient);

  if (phone === null) return null;
  const body = shown ? (
    <PanelBody
      {...props}
      patient={shown}
      Title={phone ? DrawerTitle : SheetTitle}
      Description={phone ? DrawerDescription : SheetDescription}
      phone={phone}
    />
  ) : null;

  if (phone) {
    return (
      <Drawer open={open && !!shown} onOpenChange={onOpenChange}>
        <DrawerContent>{body}</DrawerContent>
      </Drawer>
    );
  }
  return (
    <Sheet open={open && !!shown} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-[560px]"
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}

type TitleComponent = ComponentType<{ className?: string; children?: ReactNode }>;

function PanelBody({
  patient,
  inTrash,
  isAdmin,
  returnTo,
  onEdit,
  onNewOrder,
  onTrash,
  onRestore,
  onPermanentDelete,
  pending,
  Title,
  Description,
  phone,
}: PatientPanelProps & {
  patient: PanelPatient;
  Title: TitleComponent;
  Description: TitleComponent;
  phone: boolean;
}) {
  const { t, lang } = useT();
  const age = patientAge(patient.dateOfBirth);
  const gender = genderLabelKey(patient.gender);

  // Who this is. The side panel's header; on a phone, the first card.
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <PatientAvatar patient={patient} className="size-12" />
      <div className="min-w-0 flex-1">
        <Title className="truncate text-lg leading-6 font-semibold text-foreground">
          {patient.fullName}
        </Title>
        <Description className="truncate text-sm text-muted-foreground">
          {patientFacts(patient, t) ?? t('patientDesk.panel.noFacts')}
        </Description>
        {inTrash && patient.deletedAt && (
          <Badge variant="outline" className="mt-1.5 text-muted-foreground">
            {t('patientDesk.panel.inTrashSince', {
              date: formatBusinessDay(patient.deletedAt, lang),
            })}
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {phone ? (
        // A phone sheet's centred heading under the handle. The patient's
        // name, in the first card, stays the dialog's accessible title.
        <p className="shrink-0 border-b px-4 pt-2 pb-3 text-center text-base font-semibold">
          {t('patientDesk.panel.title')}
        </p>
      ) : (
        // The side panel's own close button sits at the top right.
        <header className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">{identity}</header>
      )}

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          phone ? 'bg-muted/40 p-4' : 'px-6 py-5',
        )}
      >
        <div className={cn('flex flex-col', phone ? 'gap-3' : 'gap-7')}>
          {phone && <div className={CARD}>{identity}</div>}

          {!inTrash && <PatientOrders patient={patient} returnTo={returnTo} card={phone} />}

          <PanelSection title={t('patientDesk.panel.contact')} card={phone}>
            <Facts>
              <Fact label={t('patientDesk.panel.phone')}>
                {patient.phone ? (
                  <a
                    href={phoneHref(patient.phone)}
                    className="tabular-nums underline-offset-4 hover:underline"
                  >
                    {formatPhone(patient.phone)}
                  </a>
                ) : null}
              </Fact>
              <Fact label={t('patientDesk.panel.email')}>
                {patient.email ? (
                  <a
                    href={`mailto:${patient.email}`}
                    className="wrap-anywhere underline-offset-4 hover:underline"
                  >
                    {patient.email}
                  </a>
                ) : null}
              </Fact>
              <Fact label={t('patientDesk.panel.address')}>{patient.address}</Fact>
            </Facts>
          </PanelSection>

          <PanelSection title={t('patientDesk.panel.profile')} card={phone}>
            <Facts>
              <Fact label={t('patientDesk.panel.dateOfBirth')}>
                {patient.dateOfBirth
                  ? age === null
                    ? formatDateOfBirth(patient.dateOfBirth, lang)
                    : t('patientDesk.panel.dateOfBirthWithAge', {
                        date: formatDateOfBirth(patient.dateOfBirth, lang),
                        age,
                      })
                  : null}
              </Fact>
              <Fact label={t('patientDesk.panel.gender')}>{gender ? t(gender) : null}</Fact>
              {isAdmin && (
                <Fact label={t('patientDesk.panel.dentist')}>{patient.doctor?.fullName}</Fact>
              )}
              <Fact label={t('patientDesk.panel.added')}>
                {formatBusinessDay(patient.createdAt, lang)}
              </Fact>
              <Fact label={t('patientDesk.panel.updated')}>
                {formatBusinessDay(patient.updatedAt, lang)}
              </Fact>
            </Facts>
          </PanelSection>

          <PanelSection title={t('patientDesk.panel.clinical')} card={phone}>
            <ClinicalConditions patient={patient} />
          </PanelSection>

          <PanelSection title={t('patientDesk.panel.notes')} card={phone}>
            {patient.notes ? (
              <p className="text-sm leading-6 whitespace-pre-line">{patient.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('patientDesk.panel.noNotes')}</p>
            )}
          </PanelSection>

          {!inTrash && (
            <TrashSection
              patient={patient}
              isAdmin={isAdmin}
              pending={pending}
              onTrash={onTrash}
              card={phone}
            />
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          {inTrash ? (
            <>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
                  disabled={pending}
                  onClick={() => onPermanentDelete(patient)}
                >
                  <ShieldX aria-hidden="true" />
                  {t('patientDesk.actions.deletePermanently')}
                </Button>
              )}
              <Button
                className={cn('h-11 sm:h-9', !isAdmin && 'col-span-2')}
                disabled={pending}
                onClick={() => onRestore(patient)}
              >
                <ArchiveRestore aria-hidden="true" />
                {t('patientDesk.actions.restore')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-11 sm:h-9" onClick={() => onEdit(patient)}>
                <Pencil aria-hidden="true" />
                {t('patientDesk.actions.edit')}
              </Button>
              <Button className="h-11 sm:h-9" onClick={() => onNewOrder(patient)}>
                <Plus aria-hidden="true" />
                {t('patientDesk.actions.newOrder')}
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ─── Orders ─────────────────────────────────────────────────────────

function PatientOrders({
  patient,
  returnTo,
  card,
}: {
  patient: PanelPatient;
  returnTo: string;
  card: boolean;
}) {
  const { t, lang } = useT();
  const orders = usePatientOrders(patient.id);
  const rows = orders.data?.data ?? [];
  const total = orders.data?.total;

  // Inside a phone card the rows run edge to edge under the heading: a
  // boxed list inside a card would draw a second frame.
  const listBox = card
    ? '-mx-4 -mb-4 divide-y overflow-hidden rounded-b-xl border-t'
    : 'divide-y overflow-hidden rounded-lg ring-1 ring-foreground/10';
  const rowPad = card ? 'px-4' : 'px-3';

  return (
    <PanelSection
      title={t('patientDesk.panel.orders')}
      card={card}
      aside={
        total !== undefined ? (
          <span className="text-sm text-muted-foreground tabular-nums">{total}</span>
        ) : null
      }
    >
      {orders.isPending ? (
        <div className={listBox}>
          {[0, 1].map((index) => (
            <div key={index} className={cn('flex h-[58px] items-center gap-3', rowPad)}>
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : orders.isError ? (
        <div
          className={cn(
            'flex items-center justify-between gap-3',
            !card && 'rounded-lg px-3 py-3 ring-1 ring-foreground/10',
          )}
        >
          <p className="text-sm text-muted-foreground">{t('patientDesk.panel.ordersError')}</p>
          <Button variant="ghost" size="sm" onClick={() => orders.refetch()}>
            <RefreshCw aria-hidden="true" />
            {t('patientDesk.panel.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p
          className={cn(
            'text-sm text-muted-foreground',
            !card && 'rounded-lg border border-dashed px-3 py-3',
          )}
        >
          {t('patientDesk.panel.noOrders')}
        </p>
      ) : (
        <ul className={listBox}>
          {rows.map((order) => (
            <li key={order.id}>
              <Link
                href={buildOrderNavigationHref(order, { returnTo })}
                className={cn(
                  'flex min-h-[58px] items-center gap-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none',
                  rowPad,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{order.orderCode}</span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {t('patientDesk.panel.orderCreated', {
                      date: formatBusinessDay(order.createdAt, lang),
                    })}
                  </span>
                </span>
                <OrderStatusBadge status={order.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

// ─── Sections ───────────────────────────────────────────────────────

/** A phone sheet's section: a card on the sheet's tinted ground. */
const CARD = 'rounded-xl bg-card p-4 ring-1 ring-foreground/10';

function PanelSection({
  title,
  aside,
  card,
  children,
}: {
  title: string;
  aside?: ReactNode;
  /** Draw it as a card (the phone sheet) rather than a flat section. */
  card: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-3', card && CARD)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * One fixed label column for every section, so the values of Contact and
 * Profile start on the same line (an auto column sized itself per list).
 */
function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-6">
      {children}
    </dl>
  );
}

/** A label and its value; a value that is not recorded shows a dash. */
function Fact({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{empty ? <span className="text-muted-foreground">—</span> : children}</dd>
    </>
  );
}

function ClinicalConditions({ patient }: { patient: PanelPatient }) {
  const { t } = useT();
  const conditions = patient.clinicalConditions ?? [];
  if (conditions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('patientDesk.panel.noConditions')}</p>;
  }
  const other = conditions.includes(CLINICAL_CONDITION_OTHER)
    ? patient.clinicalConditionsOther?.trim()
    : undefined;
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-wrap gap-1.5">
        {conditions.map((condition) => (
          <li key={condition}>
            <Badge variant="outline" className="h-6 rounded-md px-2 font-normal">
              {conditionLabel(condition, t)}
            </Badge>
          </li>
        ))}
      </ul>
      {other && <p className="text-sm leading-6 whitespace-pre-line">{other}</p>}
    </div>
  );
}

/**
 * Destructive last, in its own section, with its consequence in words.
 * The backend refuses to trash a patient who still has orders, so the
 * button says why it is unavailable instead of failing on click.
 */
function TrashSection({
  patient,
  isAdmin,
  pending,
  onTrash,
  card,
}: {
  patient: PanelPatient;
  isAdmin: boolean;
  pending: boolean;
  onTrash: (patient: PanelPatient) => void;
  /** Under the phone sheet's cards, which already separate it. */
  card: boolean;
}) {
  const { t } = useT();
  const orders = usePatientOrders(patient.id);
  const hasOrders = (orders.data?.total ?? 0) > 0;
  return (
    <section
      className={cn('flex flex-col items-start gap-2', card ? 'px-1 pt-1' : 'border-t pt-5')}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending || hasOrders || orders.isPending}
        onClick={() => onTrash(patient)}
      >
        <Trash2 aria-hidden="true" />
        {t('patientDesk.actions.trash')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {hasOrders
          ? t('patientDesk.panel.trashBlocked')
          : isAdmin
            ? t('patientDesk.panel.trashHintAdmin')
            : t('patientDesk.panel.trashHintDentist')}
      </p>
    </section>
  );
}
