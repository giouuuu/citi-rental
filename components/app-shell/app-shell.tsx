import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { TopHeader } from "@/components/app-shell/top-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { MutationProvider } from "@/features/shared/components/mutation-provider";

type AppShellProps = {
  children: ReactNode;
  organizationName: string;
  userName: string;
  userRole: string;
  demoMode: boolean;
};

export function AppShell({
  children,
  organizationName,
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
        organizationName={organizationName}
        userName={userName}
        userRole={userRole}
      />
      <SidebarInset id="main-content">
        <TopHeader demoMode={demoMode} />
        <MutationProvider>
          <div className="page-enter mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 md:py-8 xl:px-8">
            {children}
          </div>
        </MutationProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
