'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccountData } from '@/lib/hooks';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';

interface AccountTab {
  value: string;
  // Dot-path into the i18n dictionary — resolved per render so the tab
  // labels follow the active language.
  labelKey: string;
  href: string;
  // Optional role gate — when undefined the tab is shown to everyone
  // who can reach the account area.
  show?: (ctx: { isDentist: boolean; isAdmin: boolean }) => boolean;
}

const TAB_MAP: AccountTab[] = [
  { value: 'profile', labelKey: 'accountHome.tabProfile', href: '/account/profile' },
  {
    value: 'clinic',
    labelKey: 'accountHome.tabClinic',
    href: '/account/clinic',
    show: ({ isDentist }) => isDentist,
  },
  {
    value: 'billing-settings',
    labelKey: 'accountHome.tabBilling',
    href: '/account/billing-settings',
    show: ({ isAdmin }) => isAdmin,
  },
];

export function AccountNavTabs() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { isDentist } = useAccountData();
  const { isAdmin } = useAuth();

  const currentTab = pathname.includes('/account/clinic')
    ? 'clinic'
    : pathname.includes('/account/billing-settings')
      ? 'billing-settings'
      : 'profile';

  const tabs = useMemo(
    () => TAB_MAP.filter((tab) => !tab.show || tab.show({ isDentist, isAdmin })),
    [isDentist, isAdmin],
  );

  return (
    <Tabs
      value={currentTab}
      onValueChange={(value) => {
        const tab = tabs.find((item) => item.value === value);
        if (tab) router.push(tab.href);
      }}
    >
      <TabsList variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {t(tab.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
