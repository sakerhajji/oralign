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

/** Memo'd export at the bottom — same reasoning as NavMain.
 *  Polling hooks in <AppSidebar> trigger re-renders that would
 *  otherwise cascade into this static footer nav for no reason. */
function NavSecondaryImpl({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname()

  // Same active-match logic as NavMain — exact for "#" / hash links,
  // prefix-match for real routes so deep pages still highlight.
  const isItemActive = (url: string): boolean => {
    if (!url || url === "#") return false
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={isItemActive(item.url)}
                // Tooltip only renders while the rail is collapsed — same
                // affordance NavMain items already had; without it the
                // footer icons were unlabeled mysteries in icon mode.
                tooltip={item.title}
                className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
              >
                {/* Use next/link for client-side navigation. Plain
                    <a href> was triggering full-page reloads on every
                    sidebar tap, which kicked the user out of React
                    state (open dialogs, dirty forms). */}
                <Link href={item.url}>
                  {item.icon}
                  {/* `sr-only` (not truncate-to-zero) in icon mode: a
                      0-width span still keeps the flex `gap-2` alive,
                      which pushed the icon 4px off-centre and misaligned
                      the footer icons with the main nav column. sr-only
                      is absolutely positioned — out of the flex flow (no
                      phantom gap) — while keeping the link's accessible
                      name (display:none would strip it; the lucide icon
                      is aria-hidden). */}
                  <span className="truncate group-data-[collapsible=icon]:sr-only">
                    {item.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export const NavSecondary = React.memo(NavSecondaryImpl)
