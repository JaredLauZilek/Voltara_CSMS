// Route registry + nav structure. Adding a feature = one entry in ROUTES and
// one in NAV_SECTIONS (plus the feature folder). See CLAUDE.md §4.
// Unlike the accounting dashboard's useState<ScreenId> shell, this app uses
// real URLs — charger/session deep links must be shareable.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MapPin, Zap } from 'lucide-react';
import { LocationsScreen } from '@/features/locations';
import { ChargePointsScreen } from '@/features/charge-points';

export interface RouteDef {
  path: string;
  title: string;
  screen: ComponentType;
}

export const ROUTES: RouteDef[] = [
  { path: '/charge-points', title: 'Chargers', screen: ChargePointsScreen },
  { path: '/locations', title: 'Locations', screen: LocationsScreen },
];

export interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string | null;
  items: NavEntry[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Network',
    items: [
      { path: '/charge-points', label: 'Chargers', icon: Zap },
      { path: '/locations', label: 'Locations', icon: MapPin },
    ],
  },
];

export function titleFor(pathname: string): string {
  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return route?.title ?? 'Voltara CSMS';
}
