import Link from "next/link";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { RentalListItem } from "@/features/dashboard/components/rental-list-item";
import type { DashboardSnapshot } from "@/features/dashboard/types/dashboard";
import { formatManila } from "@/features/shared/lib/manila-time";

const LIMIT = 6;

/**
 * Bookings that hold no car until someone acts: deposit proofs to check
 * first (money already sent), then bookings still waiting on a deposit.
 */
export function BookingsToConfirmCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { proofsToVerify, awaitingDeposit } = snapshot;
  const total = proofsToVerify.length + awaitingDeposit.length;
  const proofs = proofsToVerify.slice(0, LIMIT);
  const waiting = awaitingDeposit.slice(0, LIMIT - proofs.length);

  return (
    <Card className="xl:col-span-4">
      <CardHeader>
        <CardTitle>Bookings to confirm</CardTitle>
        <CardDescription>
          {total
            ? `${proofsToVerify.length} deposit ${proofsToVerify.length === 1 ? "proof" : "proofs"} to check · ${awaitingDeposit.length} awaiting deposit`
            : "Every booking is confirmed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {total ? (
          <>
            <ul className="divide-y border-y">
              {proofs.map((rental) => (
                <RentalListItem
                  detail={`Pickup ${formatManila(rental.startAt)} · proof sent, confirm the deposit`}
                  key={rental.id}
                  label="Proof to check"
                  rental={rental}
                  tone="pending"
                />
              ))}
              {waiting.map((rental) => (
                <RentalListItem
                  detail={`Pickup ${formatManila(rental.startAt)} · booked ${formatManila(rental.createdAt)}`}
                  key={rental.id}
                  label="Awaiting deposit"
                  rental={rental}
                />
              ))}
            </ul>
            <div className="px-4 pt-4">
              <Button asChild className="w-full" variant="secondary">
                <Link href="/rentals">
                  {total > LIMIT ? `Open rentals · ${total - LIMIT} more` : "Open rentals"}
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <Empty className="border-0 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>Nothing to confirm</EmptyTitle>
              <EmptyDescription>New website bookings show here until their deposit is in.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
