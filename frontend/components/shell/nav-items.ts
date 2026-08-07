import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Sun,
  Activity,
  Lightbulb,
  GanttChartSquare,
  FileBarChart,
  MessageSquare,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Current state" },
  { href: "/today", label: "Today", icon: Sun, description: "Daily metrics & reflection" },
  { href: "/activity", label: "Activity", icon: Activity, description: "Workout history" },
  { href: "/insights", label: "Insights", icon: Lightbulb, description: "Pattern recognition" },
  { href: "/timeline", label: "Timeline", icon: GanttChartSquare, description: "Event ledger" },
  { href: "/reports", label: "Reports", icon: FileBarChart, description: "Weekly & monthly" },
  { href: "/chat", label: "Chat", icon: MessageSquare, description: "Ask Numa" },
];

// Small subset surfaced in the mobile bottom bar to avoid overcrowding.
export const MOBILE_PRIMARY_NAV: NavItem[] = [
  NAV_ITEMS[0]!,
  NAV_ITEMS[1]!,
  NAV_ITEMS[2]!,
  NAV_ITEMS[4]!,
  NAV_ITEMS[6]!,
];
