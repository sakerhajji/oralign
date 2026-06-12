"use client"

import Link from "next/link"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { EllipsisVerticalIcon, CircleUserRoundIcon, CreditCardIcon, BellIcon, LogOutIcon } from "lucide-react"
import { useLogout } from "@/lib/hooks/use-auth"
import { useUnreadNotificationCount } from "@/lib/hooks/use-notifications"
import { useT } from "@/lib/i18n/lang-context"

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??'
}

export function NavUser({
  user,
  onOpenChange,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onOpenChange?: (open: boolean) => void
}) {
  const { isMobile } = useSidebar()
  const handleLogout = useLogout()
  const { t } = useT()
  const initials = getInitials(user.name)
  const unreadQuery = useUnreadNotificationCount()
  const unread = unreadQuery.data ?? 0

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={onOpenChange}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              // Collapsed-state overrides:
              //   • `!p-0 !h-12 !w-12` reshape the button into a square
              //     tile that exactly matches the 48 px icon rail. The
              //     default size-lg gives `h-12 px-2 py-1.5` which left
              //     a 6 px gap on each side and made the avatar look
              //     "floating" inside the rail.
              //   • `mx-auto justify-center` centres the avatar
              //     horizontally so it lines up with the other rail
              //     icons above it.
              //   • The base `data-[state=open]:…` keeps the dropdown
              //     open-state highlight from the original UI.
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!h-12 group-data-[collapsible=icon]:!w-12 group-data-[collapsible=icon]:!p-0"
            >
              {/* Avatar — `rounded-full` always, so it reads as a
                  proper profile chip both expanded and collapsed.
                  In collapsed mode we bump to `h-9 w-9` so it has
                  visual weight in the rail (the cramped 32 px square
                  was the reason it looked off in the screenshot). */}
              <Avatar className="h-8 w-8 rounded-full group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9">
                <AvatarImage
                  src={user.avatar}
                  alt={user.name}
                  className="object-cover"
                />
                <AvatarFallback className="rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Name + email — hidden in icon-rail mode so they
                  don't try to wrap inside a 48 px wide button (which
                  is what produced the squashed text behind the avatar
                  in the previous screenshot). */}
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              {/* Caret — same treatment as the name block above. */}
              <EllipsisVerticalIcon className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            // Use a FIXED width so the labels never get clipped — the
            // base DropdownMenuContent class binds to the trigger's
            // measured width, which is tiny (~3rem) when the sidebar
            // is in icon-collapsed mode. Force 14rem regardless of
            // sidebar state so "Account / Billing / Notifications"
            // always render in full.
            className="!w-56 min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/account/profile">
                  <CircleUserRoundIcon />
                  {t('chrome.userMenu.account')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/billing">
                  <CreditCardIcon />
                  {t('chrome.userMenu.billing')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/notifications" className="gap-2">
                  <BellIcon />
                  {t('chrome.userMenu.notifications')}
                  {unread > 0 ? (
                    <span className="ml-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon
              />
              {t('chrome.userMenu.logOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
