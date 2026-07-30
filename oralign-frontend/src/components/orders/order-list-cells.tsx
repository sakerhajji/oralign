'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Hourglass, RefreshCcw, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { useT } from '@/lib/i18n/lang-context';
import {
  DentalOrder,
  TreatmentPlanStatus,
} from '@/lib/types';
import { cn, getAvatarUrl } from '@/lib/utils';

type OrderPatient = NonNullable<DentalOrder['patient']>;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function getAge(dateOfBirth?: string) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function OrderPatientCell({
  patient,
  emptyLabel,
  emptyContactLabel,
  className,
}: {
  patient?: OrderPatient;
  emptyLabel: string;
  emptyContactLabel: string;
  className?: string;
}) {
  const { t } = useT();
  const name = patient?.fullName ?? emptyLabel;
  const age = getAge(patient?.dateOfBirth);
  const gender = patient?.gender
    ? t(`orders.gender.${patient.gender}`)
    : undefined;
  const demographic = [
    age !== null
      ? `${age} ${t(age === 1 ? 'orders.age.yr' : 'orders.age.yrs')}`
      : undefined,
    gender,
  ]
    .filter(Boolean)
    .join(' · ');
  const photoUrl = patient?.profilePhotoUrl
    ? getAvatarUrl(patient.profilePhotoUrl)
    : '';

  return (
    <div className={cn('flex min-w-[210px] items-center gap-3', className)}>
      <Avatar size="lg" className="ring-1 ring-border">
        {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
        <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {demographic || patient?.phone || patient?.email || emptyContactLabel}
        </p>
      </div>
    </div>
  );
}

export function OrderReviewBadge({
  order,
  isDoctor,
  isAdmin,
  showEmpty = false,
}: {
  order: DentalOrder;
  isDoctor: boolean;
  isAdmin: boolean;
  showEmpty?: boolean;
}) {
  const { t } = useT();
  const status = order.latestPlanStatus;
  if (!status) {
    return showEmpty ? (
      <span className="text-xs text-muted-foreground">—</span>
    ) : null;
  }

  const audienceIsApprover = isDoctor || isAdmin;
  const map: Record<
    TreatmentPlanStatus,
    { label: string; tone: string; icon: ReactNode }
  > = {
    [TreatmentPlanStatus.PENDING]: {
      label: t('ordersPage.planPending'),
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <Hourglass className="size-3 shrink-0" />,
    },
    [TreatmentPlanStatus.READY]: {
      label: audienceIsApprover
        ? t('ordersPage.planAwaitingYours')
        : t('ordersPage.planAwaitingDoctor'),
      tone: 'border-primary/20 bg-primary/10 text-primary',
      icon: <AlertTriangle className="size-3 shrink-0" />,
    },
    [TreatmentPlanStatus.APPROVED]: {
      label: t('ordersPage.planApproved'),
      tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
      icon: <CheckCircle2 className="size-3 shrink-0" />,
    },
    [TreatmentPlanStatus.REJECTED]: {
      label: t('ordersPage.planReplanning'),
      tone: 'border-red-300 bg-red-50 text-red-900',
      icon: <RefreshCcw className="size-3 shrink-0" />,
    },
  };
  const entry = map[status];
  if (!entry) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'w-fit gap-1 whitespace-nowrap border px-2 py-0.5 text-[11px] font-medium',
        entry.tone,
      )}
    >
      {entry.icon}
      {entry.label}
    </Badge>
  );
}
