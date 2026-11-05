'use client';

import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Patient } from '@/lib/types';
import { cn, getAvatarUrl } from '@/lib/utils';
import { patientInitials } from './patient-format';

/**
 * The patient's photo when there is one, otherwise their initials on a
 * neutral disc: colour on this page belongs to the case status.
 */
export function PatientAvatar({
  patient,
  className,
}: {
  patient: Pick<Patient, 'fullName' | 'profilePhotoUrl'>;
  className?: string;
}) {
  const initials = patientInitials(patient.fullName);
  return (
    <Avatar className={cn('size-9', className)}>
      {patient.profilePhotoUrl ? (
        <AvatarImage src={getAvatarUrl(patient.profilePhotoUrl)} alt="" />
      ) : null}
      <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
        {initials || <UserRound className="size-4" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}
