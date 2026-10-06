import { IdCard } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type RentalRenterIdPhoto = {
  label: string;
  url: string | null;
};

/** The ID photos a customer uploaded with their online booking. */
export function RentalRenterIds({ photos }: { photos: RentalRenterIdPhoto[] }) {
  if (!photos.some((photo) => photo.url)) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IdCard />
          </EmptyMedia>
          <EmptyTitle>No ID photos</EmptyTitle>
          <EmptyDescription>
            ID photos are attached when a customer books online.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {photos.map((photo) => (
        <figure className="space-y-2" key={photo.label}>
          <figcaption className="text-sm font-medium text-brand-950">
            {photo.label}
          </figcaption>
          {photo.url ? (
            <a
              className="block overflow-hidden rounded-lg border border-border bg-muted/40"
              href={photo.url}
              rel="noreferrer"
              target="_blank"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={photo.label}
                className="aspect-[4/3] w-full object-contain"
                src={photo.url}
              />
            </a>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Photo unavailable
            </p>
          )}
        </figure>
      ))}
    </div>
  );
}
