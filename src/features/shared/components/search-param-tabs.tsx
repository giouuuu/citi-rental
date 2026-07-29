"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SearchParamTab = {
  value: string;
  label: string;
  content: ReactNode;
};

function SearchParamTabsInner({
  tabs,
  defaultValue = "info",
  paramName = "tab",
}: {
  tabs: SearchParamTab[];
  defaultValue?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const allowed = new Set(tabs.map((tab) => tab.value));
  const raw = searchParams.get(paramName);
  const value = raw && allowed.has(raw) ? raw : defaultValue;

  function onValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <Tabs onValueChange={onValueChange} value={value}>
      <TabsList className="w-full sm:w-fit" variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          className="mt-4 outline-none"
          key={tab.value}
          value={tab.value}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function SearchParamTabs(props: {
  tabs: SearchParamTab[];
  defaultValue?: string;
  paramName?: string;
}) {
  return (
    <Suspense
      fallback={
        <Tabs defaultValue={props.defaultValue ?? "info"}>
          <TabsList className="w-full sm:w-fit" variant="line">
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      <SearchParamTabsInner {...props} />
    </Suspense>
  );
}
