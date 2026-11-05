'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  welcomeGiftAdminService,
  welcomeGiftService,
  type DoctorWelcomeGiftMark,
  type WelcomeGiftStatus,
} from '@/lib/api/welcome-gift.service';
import { useAuth } from '@/lib/providers/auth-provider';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { toast } from '@/lib/toast';
import type { User } from '@/lib/types';
import { userKeys } from './use-users';

export const welcomeGiftKeys = {
  all: ['welcome-gift'] as const,
  status: () => [...welcomeGiftKeys.all, 'status'] as const,
};

/**
 * The signed-in dentist's welcome gift status (once per practitioner).
 * Disabled for every other role (the endpoint is dentist-only — an admin
 * would only collect a 403). Invalidated by `useSubmitOrder` so the
 * banner disappears the moment the gifted case goes through.
 */
export function useWelcomeGiftStatus(): UseQueryResult<
  WelcomeGiftStatus,
  Error
> {
  const { isDentist } = useAuth();
  return useQuery({
    queryKey: welcomeGiftKeys.status(),
    queryFn: () => welcomeGiftService.getStatus(),
    enabled: isDentist,
    // The settings behind it change rarely; a submit invalidates it.
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
}

/**
 * Admin: set or clear one practitioner's gift mark (users screen →
 * user sheet → Account → "Cadeau Oralign"). The sheet's switch reads
 * `variables.used` while pending, so it flips at once; on success the
 * detail cache takes the server's date and the list, detail and
 * overview counts refetch (the list badge and the stats move with it).
 */
export function useSetDoctorWelcomeGiftMark(): UseMutationResult<
  DoctorWelcomeGiftMark,
  Error,
  { doctorId: string; used: boolean }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ doctorId, used }) =>
      welcomeGiftAdminService.setDoctorMark(doctorId, used),
    onSuccess: (mark) => {
      queryClient.setQueryData<User>(userKeys.detail(mark.doctorId), (old) =>
        old ? { ...old, welcomeGiftUsedAt: mark.welcomeGiftUsedAt } : old,
      );
      queryClient.invalidateQueries({ queryKey: userKeys.detail(mark.doctorId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
      toast.success(
        t(
          mark.welcomeGiftUsedAt
            ? 'usersDesk.gift.toastUsed'
            : 'usersDesk.gift.toastAvailable',
        ),
      );
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
