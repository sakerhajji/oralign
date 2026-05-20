"use client"

import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import { useAuth } from "@/lib/providers/auth-provider"
import { UserRole } from "@/lib/types"

import { getAvatarUrl } from "@/lib/utils"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  ClipboardListIcon,
  CircleHelpIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  PlusIcon,
  Settings2Icon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react"

// ─── Nav item type ───────────────────────────────────────────────────────────

interface NavItem {
  title: string
  url: string
  icon: React.ReactNode
  /** If set, only users with one of these roles can see this item. */
  roles?: UserRole[]
}

// ─── Static nav data ─────────────────────────────────────────────────────────
//
// Only LIVE routes are listed here. Dead "#" entries (Lifecycle, Analytics,
// Projects, Data Library, Reports, Word Assistant, Search) have been
// removed because clicking them broke the in-router navigation contract
// (the URL would change to "#" and the page would do nothing).

const NAV_MAIN: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
  {
    title: "Users",
    url: "/dashboard/users",
    icon: <UsersIcon />,
    // Only admins and super-admins can manage users
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    title: "Patients",
    url: "/dashboard/patients",
    icon: <UserRoundIcon />,
    roles: [UserRole.DENTIST, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    title: "Orders",
    url: "/dashboard/orders",
    icon: <ClipboardListIcon />,
    roles: [
      UserRole.DENTIST,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
      UserRole.DESIGNER,
    ],
  },
]

// Footer secondary nav — settings + support + finance.
// Get Help stays even though it doesn't have a destination yet (kept on
// purpose; the user asked for it).
const NAV_SECONDARY: NavItem[] = [
  { title: "Settings",        url: "/account/profile", icon: <Settings2Icon />    },
  { title: "Payment History", url: "/account/billing", icon: <CreditCardIcon />   },
  { title: "Get Help",        url: "#",                icon: <CircleHelpIcon />   },
]

// Roles that can create new orders. Designers can VIEW orders (read-only
// in the sidebar) but can't author new ones — same rule as the inline
// "New Order" button on /dashboard/orders.
const NEW_ORDER_ROLES: UserRole[] = [
  UserRole.DENTIST,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]

// ─── Component ───────────────────────────────────────────────────────────────

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, isAdmin } = useAuth()

  // Filter nav items by role. Items without a `roles` constraint are visible
  // to everyone; items with `roles` are only shown to matching users.
  const visibleNavMain = React.useMemo(
    () =>
      NAV_MAIN.filter((item) => {
        if (!item.roles || item.roles.length === 0) return true
        return item.roles.some((r) =>
          r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN
            ? isAdmin
            : user?.role === r,
        )
      }),
    [user, isAdmin],
  )

  const canCreateOrder = React.useMemo(
    () => NEW_ORDER_ROLES.some((r) => (
      r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN
        ? isAdmin
        : user?.role === r
    )),
    [user, isAdmin],
  )

  return (
    // `collapsible="icon"` means closing the sidebar on desktop shrinks it
    // to an icon-only rail instead of sliding it completely off-canvas —
    // users still have one-tap access to every nav item without giving up
    // canvas real-estate.
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:h-auto data-[slot=sidebar-menu-button]:py-4 hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:!p-2"
            >
              {/* Centered, larger logo. In icon-collapsed mode we swap to a
                  compact square mark so the strip stays clean. */}
              <Link
                href="/dashboard"
                className="flex w-full items-center justify-center gap-2"
                aria-label="Oralign — Dashboard home"
              >
                {/* Expanded — full word mark, centered, larger than before */}
                <Image
                  src="/ORALIGN BLACK.png"
                  alt="Oralign"
                  width={240}
                  height={64}
                  className="h-12 w-auto object-contain group-data-[collapsible=icon]:hidden"
                  priority
                />
                {/* Collapsed — small square version centered in the icon rail */}
                <Image
                  src="/ORALIGN BLACK.png"
                  alt="Oralign"
                  width={64}
                  height={64}
                  className="hidden h-7 w-7 object-contain object-left group-data-[collapsible=icon]:block"
                  priority
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Quick-create CTA — black pill, white text. The dominant action
            on the dashboard is "make a new aligner order", so the button
            sits at the top of the nav where it's always one tap away.
            Designers don't see it (they can't create orders).
            When the sidebar is in icon-collapsed mode we shrink it to a
            square + plus icon so the strip stays clean. */}
        {canCreateOrder && (
          <SidebarGroup className="py-1">
            <Button
              asChild
              className="h-10 w-full justify-start gap-2 bg-foreground text-background shadow-sm hover:bg-foreground/90 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <Link
                href="/dashboard/orders/new"
                aria-label="Create a new order"
              >
                <PlusIcon className="size-4 shrink-0" />
                <span className="truncate group-data-[collapsible=icon]:hidden">
                  New Order
                </span>
              </Link>
            </Button>
          </SidebarGroup>
        )}

        <NavMain items={visibleNavMain} />
        <NavSecondary items={NAV_SECONDARY} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        {/* NavUser reads the real current user from the auth context */}
        <NavUser
          user={{
            name:   user?.fullName ?? "—",
            email:  user?.email    ?? "",
            avatar: getAvatarUrl(user?.avatarUrl),
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
