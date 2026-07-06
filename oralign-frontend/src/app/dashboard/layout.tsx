import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OnboardingGuard } from '@/components/dashboard/onboarding-guard';
import { SupportBubble } from '@/components/support/support-bubble';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarProvider
      // Start collapsed — AppSidebar layers a hover-to-expand wrapper
      // on top so the sidebar opens smoothly when the user mouses
      // over the rail and snaps back to icons-only when they leave.
      // The shadcn primitive still writes a `sidebar:state` cookie on
      // every toggle but doesn't read it on mount, so a fresh page
      // load always starts here regardless of last session state.
      defaultOpen={false}
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          // Slightly wider icon-rail (default 3rem → 3.5rem / 56px) so the
          // larger logo + nav-icons breathe instead of crowding the
          // edge. Bump this in step 1 of the "make the logo bigger"
          // recipe — every rail-width bump leaves the logo proportion
          // intact and the icons recentred automatically.
          '--sidebar-width-icon': 'calc(var(--spacing) * 14)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      {/* Silently redirects dentists who haven't finished onboarding */}
      <OnboardingGuard />

      {/* Flush `sidebar` variant (not `inset`): the inset variant floats
          the rail with p-2 padding + gives the content an m-2 margin,
          which left a ~14px transparent `bg-sidebar` strip along the
          right edge of the rail overlapping the content, plus a frame
          around the page. `sidebar` renders a solid rail with a clean
          border-r and full-width, flush content — no strip, no frame. */}
      <AppSidebar variant="sidebar" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
      {/* Doctor-only floating support bubble. The component itself
          checks the caller's role + auth status; renders null for
          admins / unauthenticated users so it's safe to mount once
          here at the layout root. */}
      <SupportBubble />
    </SidebarProvider>
  );
}
