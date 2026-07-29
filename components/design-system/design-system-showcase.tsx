"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Bell,
  CarFront,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  RadioTower,
  Trash2,
} from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { EmptyState } from "@/components/design-system/empty-state";
import { StatusBadge, type StatusTone } from "@/components/design-system/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type VehicleRow = {
  id: string;
  vehicle: string;
  plate: string;
  fleetStatus: StatusTone;
  trackerStatus: StatusTone;
  lastUpdate: string;
};

const vehicles: VehicleRow[] = [
  { id: "1", vehicle: "Toyota Vios", plate: "NCR 1842", fleetStatus: "available", trackerStatus: "moving", lastUpdate: "47 sec ago" },
  { id: "2", vehicle: "Honda City", plate: "NCR 2291", fleetStatus: "available", trackerStatus: "parked", lastUpdate: "2 min ago" },
  { id: "3", vehicle: "Nissan Urvan", plate: "VAN 5041", fleetStatus: "available", trackerStatus: "delayed", lastUpdate: "12 min ago" },
  { id: "4", vehicle: "Mitsubishi Mirage", plate: "NCR 7718", fleetStatus: "maintenance", trackerStatus: "offline", lastUpdate: "1 hr ago" },
  { id: "5", vehicle: "Toyota Innova", plate: "NCR 6308", fleetStatus: "available", trackerStatus: "online", lastUpdate: "3 min ago" },
  { id: "6", vehicle: "Suzuki Dzire", plate: "NCR 3420", fleetStatus: "inactive", trackerStatus: "offline", lastUpdate: "4 min ago" },
];

const columns: ColumnDef<VehicleRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows"
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.vehicle}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      />
    ),
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: "vehicle",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vehicle" />,
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.vehicle}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.original.plate}</p>
      </div>
    ),
  },
  {
    accessorKey: "fleetStatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fleet status" />,
    cell: ({ row }) => <StatusBadge status={row.original.fleetStatus} />,
  },
  {
    accessorKey: "trackerStatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tracker" />,
    cell: ({ row }) => <StatusBadge status={row.original.trackerStatus} />,
  },
  {
    accessorKey: "lastUpdate",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last update" />,
    cell: ({ row }) => <span className="font-mono text-xs tabular-nums">{row.original.lastUpdate}</span>,
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`Open actions for ${row.original.vehicle}`} size="icon-sm" variant="ghost">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Open vehicle</DropdownMenuItem>
          <DropdownMenuItem>View tracking</DropdownMenuItem>
          <DropdownMenuItem>Assign device</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function DesignSystemShowcase() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Primary, secondary, destructive, loading, and disabled states.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button><Plus /> Primary action</Button>
          <Button variant="outline">Secondary</Button>
          <Button variant="secondary">Dark action</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive"><Trash2 /> Destructive</Button>
          <Button disabled>Disabled</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Form controls</CardTitle>
            <CardDescription>Visible labels, helper text, errors, and grouped fields.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preview-plate">Plate number</Label>
              <Input className="font-mono" defaultValue="NCR 1842" id="preview-plate" />
              <p className="text-xs text-muted-foreground">Unique within this organization.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview-status">Vehicle status</Label>
              <Select defaultValue="available">
                <SelectTrigger className="w-full" id="preview-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="preview-notes">Operational notes</Label>
              <Textarea id="preview-notes" placeholder="Add details for rental staff..." />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="preview-error">Device IMEI</Label>
              <Input aria-invalid="true" defaultValue="863456" id="preview-error" />
              <p className="text-xs text-destructive" role="alert">IMEI must contain 15 digits.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status language</CardTitle>
            <CardDescription>Every state combines text, icon, and semantic color.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">Tracker</p>
              <div className="flex flex-wrap gap-2">
                {(["online", "moving", "parked", "delayed", "offline", "critical"] as const).map((status) => <StatusBadge key={status} status={status} />)}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">Vehicle</p>
              <div className="flex flex-wrap gap-2">
                {(["available", "maintenance", "inactive"] as const).map((status) => <StatusBadge key={status} status={status} />)}
                {(["draft", "reserved", "active", "completed"] as const).map((status) => <StatusBadge key={status} status={status} />)}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">General badges</p>
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge><Badge variant="destructive">Destructive</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System feedback</CardTitle>
          <CardDescription>Operational language states impact and a recovery path.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          <Alert>
            <RadioTower className="text-info" />
            <AlertTitle>Synchronization healthy</AlertTitle>
            <AlertDescription>All devices synchronized 47 seconds ago.</AlertDescription>
          </Alert>
          <Alert className="border-warning/25 bg-warning-surface">
            <AlertTriangle className="text-warning" />
            <AlertTitle>Two trackers are delayed</AlertTitle>
            <AlertDescription>Last updates are between 5 and 15 minutes old. Review device connectivity.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <Bell />
            <AlertTitle>Tracking integration unavailable</AlertTitle>
            <AlertDescription>Location updates are paused. Check Traccar credentials and retry.</AlertDescription>
          </Alert>
          <Alert className="border-success/25 bg-success-surface">
            <CheckCircle2 className="text-success" />
            <AlertTitle>Alert acknowledged</AlertTitle>
            <AlertDescription>The resolution note was recorded in the activity history.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fleet data table</CardTitle>
          <CardDescription>Reusable shadcn table with TanStack sorting, filtering, selection, visibility, and pagination.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={vehicles} filterKey="vehicle" filterPlaceholder="Search vehicles..." />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Overlays</CardTitle><CardDescription>Focused dialogs and contextual mobile-first drawers.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild><Button variant="outline">Open modal</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign GPS device</DialogTitle><DialogDescription>Select an unassigned device for Toyota Vios · NCR 1842.</DialogDescription></DialogHeader>
                <div className="space-y-2 py-3"><Label>GPS device</Label><Select><SelectTrigger className="w-full"><SelectValue placeholder="Select a device" /></SelectTrigger><SelectContent><SelectItem value="st-901">ST-901 · 863456789012345</SelectItem></SelectContent></Select></div>
                <DialogFooter><Button variant="outline">Cancel</Button><Button>Assign device</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Drawer>
              <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
              <DrawerContent>
                <div className="mx-auto w-full max-w-xl">
                  <DrawerHeader><DrawerTitle>Map filters</DrawerTitle><DrawerDescription>Choose which vehicle states appear on the fleet map.</DrawerDescription></DrawerHeader>
                  <div className="grid gap-3 px-4 sm:grid-cols-2">{["Moving", "Parked", "Delayed", "Offline"].map((label) => <label className="flex items-center gap-3 rounded-md border p-3 text-sm" key={label}><Checkbox defaultChecked />{label}</label>)}</div>
                  <DrawerFooter><Button>Apply filters</Button><DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose></DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive">Archive vehicle</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Archive this vehicle?</AlertDialogTitle><AlertDialogDescription>The vehicle will no longer appear in active fleet lists. Historical rentals and tracking records remain available.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Archive vehicle</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Loading state</CardTitle><CardDescription>Reserved space prevents layout shift while data loads.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64 max-w-full" /></div></div>
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="grid grid-cols-3 gap-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          </CardContent>
        </Card>
      </div>

      <EmptyState icon={CarFront} title="No vehicles yet" description="Add your first vehicle to begin tracking your fleet." action={<Button><Plus /> Add vehicle</Button>} />
    </div>
  );
}
