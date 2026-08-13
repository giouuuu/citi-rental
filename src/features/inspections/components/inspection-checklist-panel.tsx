"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  INSPECTION_ITEM_STATUSES,
  ITEM_GROUP_LABELS,
  isDamageStatus,
} from "@/features/inspections/lib/checklist-areas";
import type {
  ChecklistItemDef,
  InspectionItemStatus,
} from "@/features/inspections/types/inspection";
import { cn } from "@/lib/utils";

export type ChecklistDraftItem = ChecklistItemDef & {
  status: InspectionItemStatus;
  severity: number | null;
  notes: string;
};

const SEVERITIES: { value: number; label: string }[] = [
  { value: 1, label: "Minor" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
];

export function InspectionChecklistPanel({
  items,
  selectedAreaCode,
  onChange,
  onSelect,
}: {
  items: ChecklistDraftItem[];
  selectedAreaCode?: string | null;
  onChange: (areaCode: string, patch: Partial<ChecklistDraftItem>) => void;
  onSelect?: (areaCode: string) => void;
}) {
  const groups = [...new Set(items.map((item) => item.itemGroup))];

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const groupItems = items.filter((item) => item.itemGroup === group);
        const flagged = groupItems.filter((item) => isDamageStatus(item.status));

        return (
          <section key={group} className="space-y-2">
            <header className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 bg-background/90 px-1 py-1.5 backdrop-blur-sm">
              <h3 className="text-sm font-semibold text-foreground">
                {ITEM_GROUP_LABELS[group] ?? group}
              </h3>
              {flagged.length > 0 ? (
                <Badge variant="destructive">
                  {flagged.length} flagged
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {groupItems.length} OK
                </span>
              )}
            </header>

            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {groupItems.map((item) => {
                const damaged = isDamageStatus(item.status);
                const selected = selectedAreaCode === item.areaCode;

                return (
                  <li
                    key={item.areaCode}
                    className={cn(
                      "relative bg-card p-3 transition-colors",
                      selected && "bg-primary/5",
                      damaged && !selected && "bg-destructive/5",
                    )}
                    data-area={item.areaCode}
                  >
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                      />
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium hover:text-primary"
                        type="button"
                        onClick={() => onSelect?.(item.areaCode)}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            damaged ? "bg-destructive" : "bg-muted-foreground/30",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={item.status}
                          onValueChange={(value) =>
                            onChange(item.areaCode, {
                              status: value as InspectionItemStatus,
                              severity:
                                value === "ok" ? null : (item.severity ?? 2),
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={`${item.label} status`}
                            className="w-32"
                            id={`status-${item.areaCode}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INSPECTION_ITEM_STATUSES.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {damaged ? (
                          <Select
                            value={String(item.severity ?? 2)}
                            onValueChange={(value) =>
                              onChange(item.areaCode, { severity: Number(value) })
                            }
                          >
                            <SelectTrigger
                              aria-label={`${item.label} severity`}
                              className="w-28"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SEVERITIES.map((severity) => (
                                <SelectItem
                                  key={severity.value}
                                  value={String(severity.value)}
                                >
                                  {severity.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </div>

                    {damaged ? (
                      <div className="mt-3 space-y-1.5">
                        <Label
                          className="text-xs text-muted-foreground"
                          htmlFor={`notes-${item.areaCode}`}
                        >
                          What is wrong with the {item.label.toLowerCase()}?
                        </Label>
                        <Textarea
                          className="bg-background"
                          id={`notes-${item.areaCode}`}
                          placeholder="Describe the damage — a close-up photo is required on the photos step."
                          rows={2}
                          value={item.notes}
                          onChange={(event) =>
                            onChange(item.areaCode, {
                              notes: event.target.value,
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
