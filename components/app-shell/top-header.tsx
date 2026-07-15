"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock3,
  Search,
  TriangleAlert,
} from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navigationGroups } from "@/lib/navigation";

export function TopHeader({ demoMode }: { demoMode: boolean }) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function navigate(href: string) {
    setCommandOpen(false);
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-sm md:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="h-5 w-px bg-border" />
      <Button
        className="h-9 min-w-0 flex-1 justify-start text-muted-foreground sm:max-w-xs"
        onClick={() => setCommandOpen(true)}
        variant="outline"
      >
        <Search />
        <span className="truncate">Search fleet or jump to...</span>
        <kbd className="ml-auto hidden rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-teal-600/15 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 lg:flex">
          <span className="size-2 rounded-full bg-teal-500" />
          {demoMode ? "Simulator ready" : "Integrations healthy"}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open notifications" className="relative" size="icon" variant="ghost">
              <Bell />
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-card bg-destructive" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <span className="text-xs font-normal text-muted-foreground">3 new</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="items-start py-3">
              <TriangleAlert className="mt-0.5 text-destructive" />
              <span>
                <span className="block font-medium">Vehicle left allowed area</span>
                <span className="text-xs text-muted-foreground">NCR 1842 · 8 minutes ago</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="items-start py-3">
              <Clock3 className="mt-0.5 text-warning" />
              <span>
                <span className="block font-medium">Tracker reporting delayed</span>
                <span className="text-xs text-muted-foreground">VAN 5041 · 12 minutes ago</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-primary">
              <CheckCircle2 /> Open alert inbox
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandDialog onOpenChange={setCommandOpen} open={commandOpen}>
        <Command>
          <CommandInput placeholder="Search pages and actions..." />
          <CommandList>
            <CommandEmpty>No matching destination.</CommandEmpty>
            {navigationGroups.map((group) => (
              <CommandGroup heading={group.label} key={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.href} onSelect={() => navigate(item.href)}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.href === "/dashboard" ? (
                      <CommandShortcut>Home</CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
