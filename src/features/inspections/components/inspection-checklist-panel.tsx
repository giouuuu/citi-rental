"use client";

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
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {ITEM_GROUP_LABELS[group] ?? group}
          </h3>
          <ul className="space-y-2">
            {items
              .filter((item) => item.itemGroup === group)
              .map((item) => {
                const damaged = isDamageStatus(item.status);
                return (
                  <li
                    key={item.areaCode}
                    className={cn(
                      "rounded-md border border-border p-3",
                      selectedAreaCode === item.areaCode && "border-teal-600",
                      damaged && "bg-destructive/5",
                    )}
                  >
                    <button
                      className="mb-2 text-left text-sm font-medium"
                      type="button"
                      onClick={() => onSelect?.(item.areaCode)}
                    >
                      {item.label}
                    </button>
                    <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                      <div className="space-y-1.5">
                        <Label htmlFor={`status-${item.areaCode}`}>Status</Label>
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
                            className="w-full"
                            id={`status-${item.areaCode}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INSPECTION_ITEM_STATUSES.map((status) => (
                              <SelectItem
                                key={status.value}
                                value={status.value}
                              >
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {damaged ? (
                        <div className="space-y-1.5">
                          <Label htmlFor={`notes-${item.areaCode}`}>Notes</Label>
                          <Textarea
                            id={`notes-${item.areaCode}`}
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
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
