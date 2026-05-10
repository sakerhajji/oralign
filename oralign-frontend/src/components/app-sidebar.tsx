"use client"

import Image from "next/image"
import * as React from "react"
import { useAuth } from "@/lib/providers/auth-provider"
import { UserRole } from "@/lib/types"

import { getAvatarUrl } from "@/lib/utils"
import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  ListIcon,
  ChartBarIcon,
  FolderIcon,
  UsersIcon,
  CameraIcon,
  FileTextIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
  DatabaseIcon,
  FileChartColumnIcon,
  FileIcon,
  UserRoundIcon,
  ClipboardListIcon,
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
    roles: [UserRole.DENTIST, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DESIGNER],
  },
  {
    title: "Lifecycle",
    url: "#",
    icon: <ListIcon />,
  },
  {
    title: "Analytics",
    url: "#",
    icon: <ChartBarIcon />,
  },
  {
    title: "Projects",
    url: "#",
    icon: <FolderIcon />,
  },
]

const NAV_DOCUMENTS = [
  { name: "Data Library",   url: "#", icon: <DatabaseIcon />        },
  { name: "Reports",        url: "#", icon: <FileChartColumnIcon />  },
  { name: "Word Assistant", url: "#", icon: <FileIcon />             },
]

const NAV_SECONDARY = [
  { title: "Settings", url: "/account/profile", icon: <Settings2Icon />  },
  { title: "Get Help", url: "#", icon: <CircleHelpIcon /> },
  { title: "Search",   url: "#", icon: <SearchIcon />     },
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

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:h-auto data-[slot=sidebar-menu-button]:min-h-[112px] data-[slot=sidebar-menu-button]:p-3"
            >
              <a href="#" className="flex w-full flex-col items-center justify-center gap-2 text-center">
                <Image
                  src="/ORALIGN BLACK.png"
                  alt="Oralign"
                  width={100}
                  height={100}
                  className="object-contain"
                  priority
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={visibleNavMain} />
        <NavDocuments items={NAV_DOCUMENTS} />
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
