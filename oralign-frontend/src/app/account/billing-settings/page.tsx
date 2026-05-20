import { CompanyBillingSettingsForm } from '@/components/billing/company-billing-settings-form';

/**
 * Admin → Billing settings.
 *
 * Singleton-style configuration page for the company-billing-settings
 * row used by every Quote PDF the system generates. RBAC is enforced
 * server-side; the AccountNavTabs hides the link for non-admin roles.
 */
export default function AccountBillingSettingsPage() {
  return <CompanyBillingSettingsForm />;
}
