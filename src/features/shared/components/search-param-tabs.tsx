"use client";

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SearchParamTab = {
  value: string;
  /** Text, optionally with a count badge. */
  label: ReactNode;
  content: ReactNode;
};

/**
 * Detail pages carry up to eight tabs, more than a phone fits. The list scrolls
 * sideways inside its own strip (scrollbar hidden) instead of widening the page;
 * the bottom padding leaves room for the active tab's underline.
 */
function ScrollingTabsList({ tabs, value }: { tabs: SearchParamTab[]; value?: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // A deep link like ?tab=costs opens on a tab that may sit off-screen.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]');
    if (!scroller || !active) return;
    const box = scroller.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < box.left || tab.right > box.right) {
      scroller.scrollTo({ left: scroller.scrollLeft + tab.left - box.left - 16 });
    }
  }, [value]);

  return (
    <div
      className="overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      ref={scrollerRef}
    >
      <TabsList className="w-max min-w-full justify-start sm:min-w-0" variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

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
      <ScrollingTabsList tabs={tabs} value={value} />
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
          <ScrollingTabsList tabs={props.tabs} />
        </Tabs>
      }
    >
      <SearchParamTabsInner {...props} />
    </Suspense>
  );
}
