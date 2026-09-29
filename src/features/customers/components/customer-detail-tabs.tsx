"use client";

import type { ReactNode } from "react";

import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";

export function CustomerDetailTabs({ info, rentals }: { info: ReactNode; rentals: ReactNode }) {
  return (
    <SearchParamTabs
      tabs={[
        { value: "info", label: "Details", content: info },
        { value: "rentals", label: "Rentals", content: rentals },
      ]}
    />
  );
}
