"use client";

import { Input } from "@/components/ui/input";
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
  INSPECTION_CLEANLINESS,
  INSPECTION_ODORS,
} from "@/features/inspections/lib/checklist-areas";

export function InspectionReadingsStep({
  odometer,
  fuelLevel,
  cleanliness,
  odor,
  notes,
  onOdometer,
  onFuel,
  onCleanliness,
  onOdor,
  onNotes,
}: {
  odometer: string;
  fuelLevel: string;
  cleanliness: string;
  odor: string;
  notes: string;
  onOdometer: (value: string) => void;
  onFuel: (value: string) => void;
  onCleanliness: (value: string) => void;
  onOdor: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="grid gap-4 @md:grid-cols-2 @md:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="odometer">Odometer (km)</Label>
          <Input
            id="odometer"
            inputMode="decimal"
            min={0}
            required
            type="number"
            value={odometer}
            onChange={(event) => onOdometer(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fuel">Fuel level (%)</Label>
          <Input
            id="fuel"
            inputMode="decimal"
            max={100}
            min={0}
            required
            type="number"
            value={fuelLevel}
            onChange={(event) => onFuel(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cleanliness</Label>
          <Select value={cleanliness} onValueChange={onCleanliness}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSPECTION_CLEANLINESS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Odor</Label>
          <Select value={odor} onValueChange={onOdor}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSPECTION_ODORS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Anything the next person should know about this hand-over."
          rows={3}
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
        />
      </div>
    </div>
  );
}
