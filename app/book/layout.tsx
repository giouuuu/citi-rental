import type { ReactNode } from "react";

import { CustomerContactFab } from "@/features/settings/components/customer-contact-fab";

export default function BookLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CustomerContactFab />
    </>
  );
}
