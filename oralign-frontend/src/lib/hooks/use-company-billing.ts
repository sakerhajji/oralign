'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { companyBillingService } from '@/lib/api/company-billing.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import type {
  CompanyBillingSettings,
  UpsertCompanyBillingSettingsDto,
} from '@/lib/types';

export const companyBillingKeys = {
  all: ['company-billing'] as const,
  active: () => [...companyBillingKeys.all, 'active'] as const,
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
