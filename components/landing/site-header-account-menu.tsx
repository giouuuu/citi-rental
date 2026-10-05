"use client";

import Link from "next/link";
import { LayoutDashboard, LogOut, UserRound } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SiteHeaderAccountUser = {
  fullName: string;
  email?: string;
  avatarUrl?: string;
  initials: string;
  /** Owner/admin — shows the link into the ops app. */
  canOpenOps?: boolean;
};

export function SiteHeaderAccountMenu({
  user,
  tone = "dark",
}: {
  user: SiteHeaderAccountUser;
  tone?: "dark" | "light";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Account menu for ${user.fullName}`}
          className={
            tone === "light"
              ? "size-10 rounded-full border border-border bg-card p-0 hover:bg-muted"
              : "size-10 rounded-full border border-white/15 bg-white/10 p-0 text-white hover:bg-white/15"
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <Avatar className="size-9">
            {user.avatarUrl ? (
              <AvatarImage alt="" referrerPolicy="no-referrer" src={user.avatarUrl} />
            ) : null}
            <AvatarFallback className="bg-teal-500 text-sm font-bold text-brand-950">
              {user.initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm">{user.fullName}</span>
          {user.email ? (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.canOpenOps ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard /> Dashboard
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <input name="next" type="hidden" value="/" />
          <DropdownMenuItem asChild variant="destructive">
            <button className="w-full" type="submit">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
