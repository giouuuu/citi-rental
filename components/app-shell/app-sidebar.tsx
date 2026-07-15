"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronsUpDown, LogOut, UserRound } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { navigationGroups } from "@/lib/navigation";

type AppSidebarProps = {
  organizationName: string;
  userName: string;
  userRole: string;
};

export function AppSidebar({
  organizationName,
  userName,
  userRole,
}: AppSidebarProps) {
  const pathname = usePathname();
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-11 hover:bg-sidebar-accent"
              size="lg"
              tooltip="City Rentals"
            >
              <Link href="/dashboard">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground shadow-sm">
                  M
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold text-white">
                    City Rentals
                  </span>
                  <span className="truncate text-[11px] text-sidebar-foreground/65">
                    {organizationName}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="py-2">
        {navigationGroups.map((group) => (
          <SidebarGroup className="px-2 py-1" key={group.label}>
            <SidebarGroupLabel className="px-2 text-[10px] tracking-[0.12em] text-sidebar-foreground/45 uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/settings" &&
                      pathname.startsWith(`${item.href}/`));

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        className="relative h-10 px-3 text-sidebar-foreground/78 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-transparent hover:text-white data-active:bg-sidebar-accent data-active:text-white data-active:before:bg-sidebar-primary"
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <item.icon aria-hidden="true" className="size-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className="right-2 bg-destructive text-white">
                          {item.badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="h-12 hover:bg-sidebar-accent data-open:bg-sidebar-accent"
                  size="lg"
                  tooltip={userName}
                >
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-brand-700 text-xs font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium text-white">
                      {userName}
                    </span>
                    <span className="truncate text-[11px] capitalize text-sidebar-foreground/60">
                      {userRole.replaceAll("_", " ")}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60" side="right">
                <DropdownMenuLabel>
                  <span className="block text-sm">{userName}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {organizationName}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Building2 /> Organization settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/profile">
                    <UserRound /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logoutAction}>
                  <DropdownMenuItem asChild variant="destructive">
                    <button className="w-full" type="submit">
                      <LogOut /> Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
