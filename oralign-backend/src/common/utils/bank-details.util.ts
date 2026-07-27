export type BankDetailsSnapshot = {
  bankName?: string;
  accountName?: string;
  rib?: string;
  iban?: string;
  swift?: string;
} | null;

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasUsableBankTransferDetails(
  details: BankDetailsSnapshot,
): boolean {
  if (!details) return false;
  const hasNamedAccount =
    hasText(details.accountName) || hasText(details.bankName);
  const hasAccountNumber = hasText(details.rib) || hasText(details.iban);
  return hasNamedAccount && hasAccountNumber;
}
