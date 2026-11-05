'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

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

// The look of `<TabsList variant="line">` + `<TabsTrigger>` (components/ui/
// tabs.tsx), keyed on aria-current instead of Radix's data-state.
const TAB_LINK_CLASS = cn(
  'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all',
  'hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring',
  'dark:text-muted-foreground dark:hover:text-foreground',
  'after:absolute after:inset-x-0 after:bottom-[-5px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity',
  'aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100 dark:aria-[current=page]:text-foreground',
);

/**
 * Account section tabs. Real links (not Radix tab buttons calling
 * router.push): Next prefetches each section as soon as the bar is on
 * screen, middle-click / open-in-new-tab work, and the route's loading.tsx
 * paints the moment a tab is clicked.
 */
export function AccountNavTabs() {
  const { t } = useT();
  const pathname = usePathname();
  // Role flags from the auth context — the same user cache entry the pages
  // read, without mounting the working-hours query here.
  const { isDentist, isAdmin } = useAuth();

  const currentTab = pathname.startsWith('/account/clinic')
    ? 'clinic'
    : pathname.startsWith('/account/billing-settings')
      ? 'billing-settings'
      : 'profile';

  const tabs = TAB_MAP.filter((tab) => !tab.show || tab.show({ isDentist, isAdmin }));

  return (
    <nav aria-label={t('settingsDesk.tabs.ariaLabel')} className="flex flex-col gap-2">
      <div className="inline-flex h-8 w-fit items-center justify-center gap-1 rounded-none bg-transparent p-[3px] text-muted-foreground">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.href}
            aria-current={tab.value === currentTab ? 'page' : undefined}
            className={TAB_LINK_CLASS}
          >
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
