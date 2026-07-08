"use client"

import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import { useAuth } from "@/lib/providers/auth-provider"
import {
  useAdminSidebarBadges,
  useSupportSocket,
  useSupportUnreadCount,
} from "@/lib/hooks"
import { UserRole } from "@/lib/types"

import { getAvatarUrl } from "@/lib/utils"
import { useT } from "@/lib/i18n/lang-context"
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
  useSidebar,
} from "@/components/ui/sidebar"
import {
  ClipboardListIcon,
  BellIcon,
  CircleHelpIcon,
  CreditCardIcon,
  FileBarChartIcon,
  GalleryHorizontalIcon,
  LayoutDashboardIcon,
  MessageCircleIcon,
  NewspaperIcon,
  PackageIcon,
  PlusIcon,
  Settings2Icon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react"

// ─── Display-name formatter ──────────────────────────────────────────────────
//
// Converts the stored name ("Dr. Saker Hajji") into the sidebar display format
// ("Dr. Hajji Saker") — family name first, then given name, matching the
// formal Arabic/professional convention the clinic uses.
//
// Rules:
//   • If the name starts with "Dr. " (our canonical prefix), extract the
//     remaining parts, reverse them, and prepend "Dr. " again.
//   • One-word names (edge case) are left as-is.
//   • Non-"Dr." names are returned unchanged.

function formatDisplayName(fullName: string): string {
  const drMatch = fullName.match(/^Dr\.\s+(.+)$/i)
  if (!drMatch) return fullName
  const parts = drMatch[1].trim().split(/\s+/)
  if (parts.length < 2) return fullName
  return `Dr. ${[...parts].reverse().join(' ')}`
}

// ─── Nav item type ───────────────────────────────────────────────────────────

interface NavItemDef {
  /** Dict path resolved with t() at render time (language-aware). */
  titleKey: string
  url: string
  icon: React.ReactNode
  /** If set, only users with one of these roles can see this item. */
  roles?: UserRole[]
  /**
   * Live unread / notification count attached at render time (e.g. the
   * admin Support inbox badge). Not declared on the static NAV_MAIN
   * array — it's spread in by AppSidebar when the corresponding
   * counter query resolves.
   */
  badge?: number
}

// ─── Static nav data ─────────────────────────────────────────────────────────
//
// Only LIVE routes are listed here. Dead "#" entries (Lifecycle, Analytics,
// Projects, Data Library, Reports, Word Assistant, Search) have been
// removed because clicking them broke the in-router navigation contract
// (the URL would change to "#" and the page would do nothing).

const NAV_MAIN: NavItemDef[] = [
  {
    titleKey: "chrome.nav.dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
  {
    titleKey: "chrome.nav.users",
    url: "/dashboard/users",
    icon: <UsersIcon />,
    // Only admins and super-admins can manage users
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.patients",
    url: "/dashboard/patients",
    icon: <UserRoundIcon />,
    roles: [UserRole.DENTIST, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.orders",
    url: "/dashboard/orders",
    icon: <ClipboardListIcon />,
    roles: [
      UserRole.DENTIST,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
      UserRole.DESIGNER,
    ],
  },
  {
    titleKey: "chrome.nav.packs",
    url: "/dashboard/packs",
    icon: <PackageIcon />,
    // Admin-only — pack catalogue + price management. Doctors see the
    // pack name indirectly through the quotation snapshot, not here.
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.pendingPayments",
    url: "/dashboard/payments/pending",
    icon: <CreditCardIcon />,
    // Admin queue: pending bank-transfer confirmations + recent activity.
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.support",
    url: "/dashboard/support",
    icon: <MessageCircleIcon />,
    // Admin-only — doctors talk to support via the floating bubble.
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.mediaManagement",
    url: "/dashboard/media",
    icon: <GalleryHorizontalIcon />,
    // Admin-only — curates the doctor-dashboard slider gallery.
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.blog",
    url: "/dashboard/blog",
    icon: <NewspaperIcon />,
    // Admin-only — blog CMS (write / publish / manage public articles).
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    titleKey: "chrome.nav.reports",
    url: "/dashboard/reports",
    icon: <FileBarChartIcon />,
    // Admin-only stub — placeholder until the reports module ships.
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  // Full payment history (admin sees everyone, doctor sees their own)
  // lives at /dashboard/payments/history — the footer "Payment
  // History" link already points there, so we don't duplicate it in
  // the main nav.
]

// Footer secondary nav — settings + support + finance.
// "Obtenir de l'aide" opens the help/compliance hub at /dashboard/help
// (About / Refunds / Legal notice / Terms of sale as tabs).
const NAV_SECONDARY: NavItemDef[] = [
  { titleKey: "chrome.nav.settings",       url: "/account/profile",            icon: <Settings2Icon />    },
  // Payment History lives at /dashboard/payments/history (was
  // /account/billing). The new URL is its own dedicated dashboard
  // page rather than nested under account-settings — same role-aware
  // logic (admin sees all, dentist sees their own).
  { titleKey: "chrome.nav.paymentHistory", url: "/dashboard/payments/history", icon: <CreditCardIcon />   },
  { titleKey: "chrome.nav.getHelp",        url: "/dashboard/help",             icon: <CircleHelpIcon />   },
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
  const { t } = useT()

  // Admin-only unread-support counter. The hook polls every 20s and is
  // invalidated by the /support-chat socket on incoming messages, so the
  // sidebar badge stays in lockstep with the inbox page even when the
  // admin is sitting elsewhere in the dashboard.
  //
  // We only enable the query for admins/super-admins — doctors get their
  // unread feedback from the floating SupportBubble instead.
  const supportUnreadQuery = useSupportUnreadCount(isAdmin)
  const supportUnread = supportUnreadQuery.data ?? 0

  // Keep the admins room socket open for the lifetime of the dashboard
  // so the badge updates the instant a doctor sends a message — not on
  // the 20s poll. The hook is reference-counted: the admin support
  // page can mount it again with a conversationId and only the inbox
  // listener stays after navigation away. For doctors, the floating
  // SupportBubble owns the socket lifecycle.
  useSupportSocket({ enabled: isAdmin })

  // Admin-only attention counts for the Orders + Users nav badges:
  //   • newOrders        — orders a doctor just submitted, awaiting triage.
  //   • pendingApprovals — dentists who signed up and need approval.
  // Lightweight endpoint, polled every 30 s (low-frequency events).
  const sidebarBadgesQuery = useAdminSidebarBadges(isAdmin)
  const newOrdersBadge = sidebarBadgesQuery.data?.newOrders ?? 0
  const pendingApprovalsBadge = sidebarBadgesQuery.data?.pendingApprovals ?? 0

  // Filter nav items by role. Items without a `roles` constraint are visible
  // to everyone; items with `roles` are only shown to matching users.
  // We also inject the live `badge` count into the Support entry here so
  // NavMain doesn't need to know which item the counter belongs to.
  const visibleNavMain = React.useMemo(
    () =>
      NAV_MAIN.filter((item) => {
        if (!item.roles || item.roles.length === 0) return true
        return item.roles.some((r) =>
          r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN
            ? isAdmin
            : user?.role === r,
        )
      }).map((item) => ({
        ...item,
        // Resolve the language-aware label here so NavMain stays a
        // dumb renderer (it just prints `title`).
        title: t(item.titleKey),
        // Live attention badge per nav item. Support = unread messages;
        // Orders = new submitted orders; Users = dentists awaiting
        // approval. Order/Users counts are admin-only (the query only
        // runs for admins, so they're 0 for everyone else).
        badge:
          item.url === "/dashboard/support"
            ? supportUnread
            : item.url === "/dashboard/orders"
              ? newOrdersBadge
              : item.url === "/dashboard/users"
                ? pendingApprovalsBadge
                : undefined,
      })),
    [user, isAdmin, supportUnread, newOrdersBadge, pendingApprovalsBadge, t],
  )

  const secondaryNav = React.useMemo(
    () => NAV_SECONDARY.map((item) => ({ ...item, title: t(item.titleKey) })),
    [t],
  )

  const canCreateOrder = React.useMemo(
    () => NEW_ORDER_ROLES.some((r) => (
      r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN
        ? isAdmin
        : user?.role === r
    )),
    [user, isAdmin],
  )

  // Hover-to-expand on desktop: pull `setOpen` + `isMobile` off the
  // sidebar context, then wire `onMouseEnter` / `onMouseLeave` to
  // toggle the persisted `open` flag. The shadcn primitive already
  // animates `data-state` transitions, so flipping the flag gives a
  // smooth slide for free. Mobile uses a Sheet drawer (no hover) —
  // we skip the handlers there to avoid weird touch behaviour.
  //
  // A small leave-delay (150 ms) absorbs accidental mouse-outs (e.g.
  // crossing a hairline border) so the sidebar doesn't flicker when
  // the cursor brushes its edge. Cleared on enter so the collapse is
  // immediate the moment the user actually leaves the rail.
  const { setOpen, isMobile } = useSidebar()
  const leaveTimerRef = React.useRef<number | null>(null)
  const pointerInsideSidebarRef = React.useRef(false)
  const overlayHoldRef = React.useRef(false)

  const clearLeaveTimer = React.useCallback(() => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const scheduleClose = React.useCallback((delay = 220) => {
    if (isMobile) return
    clearLeaveTimer()
    leaveTimerRef.current = window.setTimeout(() => {
      if (!pointerInsideSidebarRef.current && !overlayHoldRef.current) {
        setOpen(false)
      }
      leaveTimerRef.current = null
    }, delay)
  }, [clearLeaveTimer, isMobile, setOpen])

  const handleMouseEnter = React.useCallback(() => {
    if (isMobile) return
    pointerInsideSidebarRef.current = true
    clearLeaveTimer()
    setOpen(true)
  }, [clearLeaveTimer, isMobile, setOpen])

  const handleMouseLeave = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (isMobile) return
    const nextTarget = event.relatedTarget
    pointerInsideSidebarRef.current = false

    if (nextTarget instanceof Element) {
      if (nextTarget.closest('[data-slot="dropdown-menu-content"]')) return
      if (nextTarget.closest('[data-slot="tooltip-content"]')) {
        scheduleClose(420)
        return
      }
    }

    scheduleClose()
  }, [isMobile, scheduleClose])

  const handleUserMenuOpenChange = React.useCallback((open: boolean) => {
    if (isMobile) return
    overlayHoldRef.current = open
    if (open) {
      clearLeaveTimer()
      setOpen(true)
    } else {
      scheduleClose()
    }
  }, [clearLeaveTimer, isMobile, scheduleClose, setOpen])

  React.useEffect(() => {
    // Clear the pending close on unmount so a stale callback can't
    // fire after the component is gone (rare in practice — sidebar
    // lives for the whole dashboard session — but it's the right
    // teardown contract).
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
    }
  }, [])

  return (
    // `collapsible="icon"` means closing the sidebar on desktop shrinks it
    // to an icon-only rail instead of sliding it completely off-canvas —
    // users still have one-tap access to every nav item without giving up
    // canvas real-estate.
    //
    // The arbitrary-selector class bumps every nav-menu SVG icon to
    // `size-5` (20 px) — the default sidebar primitive ships `size-4`
    // (16 px), which felt cramped in the wider rail. `!` keeps the
    // override from being undone by the primitive's own `size-4` rule.
    <Sidebar
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="[&_[data-sidebar=menu-button]_svg]:!size-5 [&_[data-sidebar=menu-action]_svg]:!size-5"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              // Collapsed geometry (flush `sidebar` variant, 3.5rem/56px
              // icon rail): the header slot is 40px wide (56px rail − the
              // header's p-2), so the tile is `!w-10` (40px) and lines up
              // on the same axis as the rail icons (the old forced 48px
              // overflowed the slot and sat off-axis).
              //
              // `!h-28` (112px) deliberately matches the EXPANDED header
              // height (h-20 logo + py-4×2): hover-expand used to change
              // the header from 48px to 112px, shoving every nav row 64px
              // down mid-hover — the row under the cursor changed while
              // the user was aiming, so clicks landed on the wrong item.
              // Equal heights in both states keep the rows pinned.
              className="data-[slot=sidebar-menu-button]:h-auto data-[slot=sidebar-menu-button]:py-4 hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!h-28 group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!min-w-10 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!overflow-visible"
            >
              {/* Sidebar header logo — two variants swapped via the
                  shadcn sidebar's `data-[collapsible=icon]` group attr:
                    • Expanded  → full ORALIGN word-mark PNG, centred.
                                  Bumped from h-12 (48px) to h-14
                                  (56px) so the brand reads as a
                                  proper header anchor when the rail
                                  opens, not a tiny strip.
                    • Collapsed → standalone `iconLogo.svg` brand mark.
                                  Sized at h-12 (48px) so the brand mark
                                  reads clearly without overpowering the
                                  compact icon rail.
                  Both variants are wrapped in the same Link, so a tap
                  at any sidebar width takes you to /dashboard. */}
              <Link
                href="/dashboard"
                className="flex w-full items-center justify-center gap-2"
                aria-label={t('chrome.nav.dashboardHomeAria')}
              >
                {/* Expanded — full word mark, centered.
                    Step "make logo bigger" levers:
                      • `h-20` (80 px) is the rendered height. Bump
                        to `h-24` (96 px) if you want it even larger.
                      • Image `width`/`height` are the intrinsic
                        dimensions Next.js uses to size the source.
                        Keep them roughly 4× of the rendered height
                        so the PNG stays sharp on retina screens. */}
                <Image
                  src="/mainlogo.svg"
                  alt="Oralign"
                  width={360}
                  height={96}
                  className="h-20 w-auto object-contain group-data-[collapsible=icon]:hidden"
                  priority
                />
                {/* Collapsed — standalone brand mark. SVG so it stays
                    crisp at any DPR; `h-10 w-10` (40 px) fills the 40px
                    tile and keeps the mark on the rail-icon axis. It
                    stays larger than the nav icons without overflowing
                    the slot. */}
                <Image
                  src="/iconLogo.svg"
                  alt="Oralign"
                  width={64}
                  height={56}
                  className="mx-auto hidden h-10 w-10 object-contain group-data-[collapsible=icon]:block"
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
              // Collapsed tile stays h-10 (same as the expanded row): a
              // height delta here shifts every nav row during hover-expand
              // (see the header comment above) — the old h-8 added 8px of
              // drift. w-10 fills the 40px flush-rail slot on the icon axis.
              className="h-10 w-full justify-start gap-2 bg-foreground text-background shadow-sm hover:bg-foreground/90 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <Link
                href="/dashboard/orders/new"
                aria-label={t('chrome.nav.newOrderAria')}
              >
                <PlusIcon className="size-4 shrink-0" />
                <span className="truncate group-data-[collapsible=icon]:hidden">
                  {t('chrome.nav.newOrder')}
                </span>
              </Link>
            </Button>
          </SidebarGroup>
        )}

        <NavMain items={visibleNavMain} />
        <NavSecondary items={secondaryNav} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        {/* NavUser reads the real current user from the auth context */}
        <NavUser
          onOpenChange={handleUserMenuOpenChange}
          user={{
            name:   formatDisplayName(user?.fullName ?? "—"),
            email:  user?.email    ?? "",
            avatar: getAvatarUrl(user?.avatarUrl),
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
