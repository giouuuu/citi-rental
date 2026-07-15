import {
  BellRing,
  CarFront,
  ChartNoAxesCombined,
  KeyRound,
  LayoutDashboard,
  Map,
  MapPinned,
  RadioTower,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
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
      { title: "Live map", href: "/map", icon: Map },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Vehicles", href: "/vehicles", icon: CarFront },
      { title: "Rentals", href: "/rentals", icon: KeyRound },
      { title: "Customers", href: "/customers", icon: UsersRound },
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
      { title: "Reports", href: "/reports", icon: ChartNoAxesCombined },
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
