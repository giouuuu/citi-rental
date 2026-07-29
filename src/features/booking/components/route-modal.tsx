"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RouteModalProps = {
  children: ReactNode;
  title: string;
  description?: string;
  /** Extra footer under the body. Pass null to hide the default browse link. */
  footer?: ReactNode | null;
};

export function RouteModal({
  children,
  title,
  description,
  footer,
}: RouteModalProps) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") router.back();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const resolvedFooter =
    footer === undefined ? (
      <p className="text-center text-xs text-muted-foreground">
        Or{" "}
        <Link className="underline underline-offset-2" href="/#fleet">
          browse more cars
        </Link>
      </p>
    ) : (
      footer
    );

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent
        className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg data-open:zoom-in-100 data-closed:zoom-out-100"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {resolvedFooter}
      </DialogContent>
    </Dialog>
  );
}
