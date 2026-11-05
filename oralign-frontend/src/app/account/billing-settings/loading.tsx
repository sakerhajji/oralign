import { CompanyBillingSettingsSkeleton } from '@/components/billing/company-billing-settings-skeleton';

/**
 * Painted the moment the Billing tab is clicked, while the route loads —
 * the same skeleton the form shows while its settings load.
 */
export default function AccountBillingSettingsLoading() {
  return <CompanyBillingSettingsSkeleton />;
}
