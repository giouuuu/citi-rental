import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NOINDEX } from "@/features/seo/lib/business";

export const metadata: Metadata = { robots: NOINDEX };

export default function NoIndexLayout({ children }: { children: ReactNode }) {
  return children;
}
