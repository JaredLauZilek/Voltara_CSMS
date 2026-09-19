// Route registry + nav structure. Adding a feature = one entry in ROUTES and
// one in NAV_SECTIONS (plus the feature folder). See CLAUDE.md §4.
// Unlike the accounting dashboard's useState<ScreenId> shell, this app uses
// real URLs — charger/session deep links must be shareable.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BatteryCharging,
  CreditCard,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Users,
  Zap,
} from 'lucide-react';
import { OverviewScreen } from '@/features/overview';
import { LocationsScreen } from '@/features/locations';
import { ChargePointsFeature } from '@/features/charge-points';
import { SessionsFeature } from '@/features/sessions';
import { IssuesScreen } from '@/features/issues';
import { IdTagsScreen } from '@/features/id-tags';
import { OcppLogsScreen } from '@/features/ocpp-logs';
import { TeamScreen } from '@/features/team';

export interface RouteDef {
  path: string;
  title: string;
  screen: ComponentType;
}

export const ROUTES: RouteDef[] = [
  { path: '/overview', title: 'Overview', screen: OverviewScreen },
  { path: '/charge-points', title: 'Chargers', screen: ChargePointsFeature },
  { path: '/locations', title: 'Locations', screen: LocationsScreen },
  { path: '/sessions', title: 'Sessions', screen: SessionsFeature },
  { path: '/issues', title: 'Issues', screen: IssuesScreen },
  { path: '/id-tags', title: 'ID Tags', screen: IdTagsScreen },
  { path: '/ocpp-logs', title: 'OCPP Log', screen: OcppLogsScreen },
  { path: '/team', title: 'Team', screen: TeamScreen },
];

/** Where "/" lands. */
export const HOME_PATH = '/overview';

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
    label: null,
    items: [{ path: '/overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Network',
    items: [
      { path: '/charge-points', label: 'Chargers', icon: Zap },
      { path: '/locations', label: 'Locations', icon: MapPin },
      { path: '/sessions', label: 'Sessions', icon: BatteryCharging },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/issues', label: 'Issues', icon: AlertTriangle },
      { path: '/id-tags', label: 'ID tags', icon: CreditCard },
      { path: '/ocpp-logs', label: 'OCPP log', icon: ScrollText },
    ],
  },
  {
    label: 'Settings',
    items: [{ path: '/team', label: 'Team', icon: Users }],
  },
];

export function titleFor(pathname: string): string {
  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return route?.title ?? 'Voltara CSMS';
}
