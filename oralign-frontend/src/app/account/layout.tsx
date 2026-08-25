import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AccountNavTabs } from '@/components/account/account-nav-tabs';

// Auth-gated product surface — same noindex rationale as /dashboard.
export const metadata: Metadata = {
  title: { default: 'Mon compte', template: '%s · Oralign' },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--sidebar-width-icon': 'calc(var(--spacing) * 14)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      {/* Flush `sidebar` variant — see dashboard/layout.tsx: `inset`
          floated the rail and left a transparent strip overlapping the
          content. Keep both layouts on the same flush variant. */}
      <AppSidebar variant="sidebar" />
      <SidebarInset>
        <SiteHeader />
        <div className="px-4 pt-4 lg:px-6">
          <AccountNavTabs />
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
