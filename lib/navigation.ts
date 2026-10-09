import type { AppRole } from "@/features/shared/lib/app-roles";
import {
  BellRing,
  CarFront,
  ChartNoAxesCombined,
  FileSpreadsheet,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  MessageSquareQuote,
  RadioTower,
  ReceiptText,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /** Only these roles see the item; omitted means every ops role. */
  roles?: AppRole[];
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Analytics", href: "/analytics", icon: ChartNoAxesCombined },
      { title: "Reports", href: "/reports", icon: FileSpreadsheet },
      { title: "Finance", href: "/finance", icon: Landmark, roles: ["owner"] },
      { title: "Live map", href: "/map", icon: Map },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Vehicles", href: "/vehicles", icon: CarFront },
      { title: "Maintenance", href: "/maintenance", icon: Wrench },
      { title: "Rentals", href: "/rentals", icon: KeyRound },
      { title: "Expenses", href: "/expenses", icon: ReceiptText },
      { title: "Customers", href: "/customers", icon: UsersRound },
      { title: "Drivers", href: "/drivers", icon: IdCard },
      { title: "Reviews", href: "/reviews", icon: MessageSquareQuote },
      { title: "GPS devices", href: "/devices", icon: RadioTower },
    ],
  },
  {
    label: "Tracking",
    items: [
      { title: "Geofences", href: "/geofences", icon: MapPinned },
      {
        title: "Alerts",
        href: "/alerts",
        icon: TriangleAlert,
        badge: "3",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", href: "/settings/users", icon: Users },
      {
        title: "Integrations",
        href: "/settings/integrations",
        icon: ShieldCheck,
      },
      { title: "Settings", href: "/settings", icon: Settings },
      {
        title: "Design system",
        href: "/design-system",
        icon: BellRing,
      },
    ],
  },
];

export const navigationItems = navigationGroups.flatMap(
  (group) => group.items,
);

/** The groups a role can see, dropping groups left empty. */
export function navigationGroupsFor(role: string): NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || item.roles.includes(role as AppRole),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
