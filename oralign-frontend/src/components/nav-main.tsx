"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  label,
}: {
  /**
   * Optional group heading (e.g. the admin "Production" group). It keeps
   * its 32px in the icon rail too, drawn as a short rule there: a label
   * that collapsed to nothing would push every row under it down while
   * the sidebar hover-expands, and the row under the cursor would change.
   */
  label?: string
  items: {
    title: string
    url: string
    /**
     * Sub-routes that have their own entry, so this one is not lit on
     * them too (the production queue vs Ma journée / Pilotage).
     */
    excludePrefixes?: string[]
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
    /**
     * What the badge counts, in words ("3 nouveaux virements"): the
     * tooltip, and the text screen readers hear after the title (the
     * pills themselves are aria-hidden).
     */
    badgeLabel?: string
  }[]
}) {
  const pathname = usePathname()

  /**
   * Highlight the currently-active route in the sidebar. Exact match for
   * the dashboard root ("/dashboard"), prefix match for everything else —
   * so visiting `/dashboard/orders/abc123` still highlights the "Orders"
   * sidebar entry.
   */
  const isUnder = (prefix: string): boolean =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)

  const isItemActive = (url: string, excludePrefixes?: string[]): boolean => {
    if (!url || url === "#") return false
    if (url === "/dashboard") return pathname === "/dashboard"
    return isUnder(url) && !excludePrefixes?.some(isUnder)
  }

  return (
    <SidebarGroup>
      {label ? (
        <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
          <span className="truncate group-data-[collapsible=icon]:sr-only">
            {label}
          </span>
          <span
            aria-hidden
            className="mx-auto hidden h-px w-6 bg-sidebar-border group-data-[collapsible=icon]:block"
          />
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const badgeCount = item.badge ?? 0
            const hasBadge = badgeCount > 0
            // Pretty-printed count: cap at 99+ so the pill never
            // grows wider than the icon-rail badge in collapsed mode.
            const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount)
            const badgeWords = hasBadge ? (item.badgeLabel ?? badgeLabel) : null
            return (
              <SidebarMenuItem key={item.title} className="relative">
                <SidebarMenuButton
                  asChild
                  tooltip={badgeWords ? `${item.title} (${badgeWords})` : item.title}
                  isActive={isItemActive(item.url, item.excludePrefixes)}
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                >
                  <Link href={item.url}>
                    {item.icon}
                    {/* Hide the label in the collapsed icon-rail explicitly.
                        The primitive only truncates the LAST child span
                        (`[&>span:last-child]:truncate`); when a badge pill
                        follows, the title span is no longer last, loses the
                        truncation, and its text leaks out the icon rail (the
                        "Ass…" bug). `sr-only` (not `hidden`): display:none
                        would strip the link's accessible name (the lucide
                        icon is aria-hidden), while sr-only is absolutely
                        positioned — out of the flex flow (no phantom gap),
                        still read by screen readers. */}
                    <span className="truncate group-data-[collapsible=icon]:sr-only">
                      {item.title}
                    </span>
                    {badgeWords ? <span className="sr-only">, {badgeWords}</span> : null}
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
                    marker on the button's top-right corner so it stays
                    visible while the title is hidden. Single digits show
                    the count; from 10 up we degrade to a plain dot — a
                    2–3 digit pill grew wide enough to cover most of the
                    20px icon, hiding WHICH item was flagged (the exact
                    count still shows in the expanded pill + tooltip).
                    Pointer-events-none so it can't steal the click. */}
                {hasBadge ? (
                  badgeCount > 9 ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-1.5 top-1.5 hidden size-2.5 rounded-full bg-destructive ring-2 ring-background group-data-[collapsible=icon]:block"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-1 top-1 hidden min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background group-data-[collapsible=icon]:grid"
                    >
                      {badgeCount}
                    </span>
                  )
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
