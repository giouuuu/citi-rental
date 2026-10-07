"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, ExternalLink, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WebsiteListingBlocker } from "@/features/vehicles/lib/vehicle-website-listing";
import { cn } from "@/lib/utils";

/**
 * Whether customers can book this car on the website. Click it for the
 * reasons it's hidden, each with a link to fix it.
 */
export function VehicleWebsiteBadge({
  vehicleId,
  blockers,
}: {
  vehicleId: string;
  blockers: WebsiteListingBlocker[];
}) {
  const [open, setOpen] = useState(false);
  const listed = blockers.length === 0;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Badge
          asChild
          className={cn(
            "h-6 cursor-pointer px-2.5",
            listed
              ? "border-success/20 bg-success-surface text-success"
              : "border-warning/30 bg-warning-surface text-warning",
          )}
          variant="outline"
        >
          <button type="button">
            {listed ? <Globe aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            {listed ? "On website" : "Not on website"}
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        {listed ? (
          <>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Customers can book this car</p>
              <p className="text-sm text-muted-foreground">
                It shows on the website for any dates it isn&apos;t already booked.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/book/${vehicleId}`} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden="true" />
                View on website
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Why customers can&apos;t book it</p>
            <ul className="space-y-3">
              {blockers.map((blocker) => (
                <li className="space-y-1" key={blocker.title}>
                  <p className="text-sm font-medium">{blocker.title}</p>
                  <p className="text-sm text-muted-foreground">{blocker.detail}</p>
                  {blocker.fix ? (
                    <Link
                      className="text-sm font-medium text-primary hover:underline"
                      href={blocker.fix.href}
                      onClick={() => setOpen(false)}
                      scroll={false}
                    >
                      {blocker.fix.label}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
