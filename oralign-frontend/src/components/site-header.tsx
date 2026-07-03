import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { LanguageSwitcher } from "@/components/layout/language-switcher"

/**
 * Dashboard header strap. Houses the sidebar toggle on the left and
 * the notification bell on the right. Anything role-aware (admin vs
 * doctor) is rendered inside the bell itself — the header layout
 * doesn't fork by role.
 */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        {/* Mobile-only: on desktop the sidebar hover-expands, and the
            trigger actively misbehaved there — the expanded sidebar is a
            fixed overlay that COVERS the trigger, so it couldn't be
            re-clicked to close, and a second click on the same spot hit
            the header logo link underneath and navigated to /dashboard.
            On mobile the sidebar is a Sheet and this button is the only
            way to open it, so it stays for < md. */}
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4 md:hidden"
        />

        {/* Spacer — pushes the trailing actions to the right edge
            regardless of whether any centred content lands here later. */}
        <div className="flex-1" />

        {/* Trailing action cluster — language switcher sits left of
            the notification bell so the bell stays the rightmost
            anchor users expect to click. */}
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
