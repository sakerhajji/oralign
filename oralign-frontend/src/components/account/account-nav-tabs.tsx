'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccountData } from '@/lib/hooks';

const TAB_MAP = [
  { value: 'profile', label: 'Profile', href: '/account/profile' },
  { value: 'clinic', label: 'Clinic', href: '/account/clinic' },
];

export function AccountNavTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDentist } = useAccountData();

  const currentTab = pathname.includes('/account/clinic') ? 'clinic' : 'profile';

  const tabs = useMemo(
    () => (isDentist ? TAB_MAP : TAB_MAP.filter((tab) => tab.value !== 'clinic')),
    [isDentist],
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
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
