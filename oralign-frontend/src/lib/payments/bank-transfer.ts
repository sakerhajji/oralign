import type { BankDetails } from '@/lib/types';

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasUsableBankTransferDetails(
  details: BankDetails | null | undefined,
): boolean {
  if (!details) return false;
  const hasNamedAccount =
    hasText(details.accountName) || hasText(details.bankName);
  const hasAccountNumber = hasText(details.rib) || hasText(details.iban);
  return hasNamedAccount && hasAccountNumber;
}
