'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  companyBillingService,
  type BillingPublicDefaults,
} from '@/lib/api/company-billing.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import type {
  CompanyBillingSettings,
  UpsertCompanyBillingSettingsDto,
} from '@/lib/types';

export const companyBillingKeys = {
  all: ['company-billing'] as const,
  active: () => [...companyBillingKeys.all, 'active'] as const,
  publicDefaults: () => [...companyBillingKeys.all, 'public-defaults'] as const,
};

/** Read the singleton settings row (or null if not configured yet). */
export function useCompanyBilling(
  enabled = true,
): UseQueryResult<CompanyBillingSettings | null, Error> {
  return useQuery({
    queryKey: companyBillingKeys.active(),
    queryFn: () => companyBillingService.get(),
    enabled,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Read the doctor-safe public defaults (treatment fee + currency)
 * from the singleton settings row. Hits a separate role-aware
 * controller (`/company-billing-settings/public-defaults`) so the
 * dentist role gets the value without needing admin permissions for
 * the full settings record.
 *
 * Used by the treatment-fee payment dialog so the modal always shows
 * the value the admin set under /account/billing-settings, regardless
 * of who's looking at the dialog.
 */
export function useBillingPublicDefaults(
  enabled = true,
): UseQueryResult<BillingPublicDefaults, Error> {
  return useQuery({
    queryKey: companyBillingKeys.publicDefaults(),
    queryFn: () => companyBillingService.getPublicDefaults(),
    enabled,
    // Treatment fee changes rarely — settings page edits invalidate
    // the cache, so a 5-minute stale window is safe and avoids hitting
    // the endpoint on every dialog open.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export function useUpsertCompanyBilling(): UseMutationResult<
  CompanyBillingSettings,
  Error,
  UpsertCompanyBillingSettingsDto
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto) => companyBillingService.upsert(dto),
    onSuccess: (saved) => {
      queryClient.setQueryData(companyBillingKeys.active(), saved);
      // Bust the doctor-facing public-defaults cache so the next
      // payment dialog opens with the fresh fee instead of the
      // stale one we cached for 5 min.
      queryClient.invalidateQueries({
        queryKey: companyBillingKeys.publicDefaults(),
      });
      toast.success('Company billing settings saved.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUploadCompanyLogo(): UseMutationResult<
  CompanyBillingSettings,
  Error,
  File
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) => companyBillingService.uploadLogo(file),
    onSuccess: (saved) => {
      queryClient.setQueryData(companyBillingKeys.active(), saved);
      toast.success('Logo uploaded.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteCompanyLogo(): UseMutationResult<
  CompanyBillingSettings | null,
  Error,
  void
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => companyBillingService.deleteLogo(),
    onSuccess: (saved) => {
      queryClient.setQueryData(companyBillingKeys.active(), saved);
      toast.success('Logo removed.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
