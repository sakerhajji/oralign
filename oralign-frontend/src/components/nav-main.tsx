"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/**
 * NavMain is wrapped in React.memo at the bottom of the file.
 *
 * Why: the parent <AppSidebar> hosts polling hooks (`useSupportUnreadCount`
 * every 20 s, `useUnreadNotificationCount` every 15 s, plus the support
 * socket). Every poll re-renders <AppSidebar>. Without memo, this whole
 * 8-item nav tree re-renders too — bad mid-animation.
 * With memo, NavMain only re-renders when its `items` prop changes
 * (i.e. when the support badge actually changes, not every tick).
 */
function NavMainImpl({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    /**
     * Optional unread/notification counter rendered next to the
     * item. Currently used by the admin "Support" entry to surface
     * the number of unread support messages. When > 0:
     *   • Expanded sidebar → red pill on the right of the title.
     *   • Collapsed (icon)  → small red dot anchored to the icon's
     *     top-right corner.
     * Set to 0 / undefined to hide the badge entirely.
     */
    badge?: number
  }[]
}) {
  const pathname = usePathname()

  /**
   * Highlight the currently-active route in the sidebar. Exact match for
   * the dashboard root ("/dashboard"), prefix match for everything else —
   * so visiting `/dashboard/orders/abc123` still highlights the "Orders"
   * sidebar entry.
   */
  const isItemActive = (url: string): boolean => {
    if (!url || url === "#") return false
    if (url === "/dashboard") return pathname === "/dashboard"
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const badgeCount = item.badge ?? 0
            const hasBadge = badgeCount > 0
            // Pretty-printed count: cap at 99+ so the pill never
            // grows wider than the icon-rail badge in collapsed mode.
            const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount)
            return (
              <SidebarMenuItem key={item.title} className="relative">
                <SidebarMenuButton
                  asChild
                  tooltip={
                    hasBadge ? `${item.title} (${badgeLabel} unread)` : item.title
                  }
                  isActive={isItemActive(item.url)}
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                >
                  <Link href={item.url}>
                    {item.icon}
                    <span>{item.title}</span>
                    {/* Inline pill — only visible while the sidebar
                        is expanded. `ml-auto` shoves it to the right
                        edge of the row. */}
                    {hasBadge ? (
                      <span
                        aria-hidden
                        className="ml-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-white group-data-[collapsible=icon]:hidden"
                      >
                        {badgeLabel}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
                {/* Collapsed (icon-rail) badge — absolutely-positioned
                    red dot anchored to the menu button's top-right
                    corner so it stays visible even when the title
                    text is hidden. `ring-background` lifts it off
                    the icon visually. Pointer-events-none so it
                    can't intercept the menu-button click. */}
                {hasBadge ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-1 top-1 hidden min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background group-data-[collapsible=icon]:grid"
                  >
                    {badgeLabel}
                  </span>
                ) : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// Memo'd export — see the comment above NavMainImpl for the rationale.
export const NavMain = React.memo(NavMainImpl)
