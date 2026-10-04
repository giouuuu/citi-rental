import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { TopHeader } from "@/components/app-shell/top-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { MutationProvider } from "@/features/shared/components/mutation-provider";

type AppShellProps = {
  children: ReactNode;
  companyName: string;
  userName: string;
  userRole: string;
  demoMode: boolean;
};

export function AppShell({
  children,
  companyName,
  userName,
  userRole,
  demoMode,
}: AppShellProps) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "4.5rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        companyName={companyName}
        userName={userName}
        userRole={userRole}
      />
      {/* min-w-0: a flex item defaults to its content's width, so one wide
          table would push the page sideways under the fixed sidebar. This
          keeps the page at the viewport and lets the table scroll instead. */}
      <SidebarInset className="min-w-0" id="main-content">
        <TopHeader demoMode={demoMode} userRole={userRole} />
        <MutationProvider>
          <div className="page-enter mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 md:py-8 xl:px-8">
            {children}
          </div>
        </MutationProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
