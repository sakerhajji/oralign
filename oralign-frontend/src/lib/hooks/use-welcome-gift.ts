'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  welcomeGiftService,
  type WelcomeGiftStatus,
} from '@/lib/api/welcome-gift.service';
import { useAuth } from '@/lib/providers/auth-provider';

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
