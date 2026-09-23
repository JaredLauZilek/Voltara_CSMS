// Route registry + nav structure. Adding a feature = one entry in ROUTES and
// one in NAV_SECTIONS (plus the feature folder). See CLAUDE.md §4.
// Unlike the accounting dashboard's useState<ScreenId> shell, this app uses
// real URLs — charger/session deep links must be shareable.

import { lazy, Suspense, type ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BatteryCharging,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  MapPin,
  PieChart,
  Receipt,
  Settings,
  ScrollText,
  Smartphone,
  Tags,
  Users,
  UsersRound,
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
import { TariffsFeature } from '@/features/tariffs';
import { DriverGroupsScreen } from '@/features/driver-groups';
import { BillingAccountsScreen } from '@/features/billing-accounts';
import { CdrsFeature } from '@/features/cdrs';
import { DocumentsFeature } from '@/features/documents';
import { ReportsScreen } from '@/features/reports';
import { OperatorSettingsScreen } from '@/features/operator-settings';

export interface RouteDef {
  path: string;
  title: string;
  screen: ComponentType;
}

// Dev-only: the phone link + local service health. The lazy import lives
// inside a function that only the DEV branch below calls, so a production
// build neither registers the route nor bundles the chunk.
function devRoute(): RouteDef {
  const Lazy = lazy(() =>
    import('@/features/dev-tools').then((m) => ({ default: m.DevToolsScreen })),
  );
  return {
    path: '/dev',
    title: 'Dev',
    screen: () => (
      <Suspense fallback={null}>
        <Lazy />
      </Suspense>
    ),
  };
}

export const ROUTES: RouteDef[] = [
  { path: '/overview', title: 'Overview', screen: OverviewScreen },
  { path: '/charge-points', title: 'Chargers', screen: ChargePointsFeature },
  { path: '/locations', title: 'Locations', screen: LocationsScreen },
  { path: '/sessions', title: 'Sessions', screen: SessionsFeature },
  { path: '/issues', title: 'Issues', screen: IssuesScreen },
  { path: '/id-tags', title: 'ID Tags', screen: IdTagsScreen },
  { path: '/ocpp-logs', title: 'OCPP Log', screen: OcppLogsScreen },
  { path: '/tariffs', title: 'Tariffs', screen: TariffsFeature },
  { path: '/driver-groups', title: 'Driver groups', screen: DriverGroupsScreen },
  { path: '/billing-accounts', title: 'Billing accounts', screen: BillingAccountsScreen },
  { path: '/cdrs', title: 'Charging records', screen: CdrsFeature },
  { path: '/documents', title: 'Documents', screen: DocumentsFeature },
  { path: '/reports', title: 'Reports', screen: ReportsScreen },
  { path: '/team', title: 'Team', screen: TeamScreen },
  { path: '/operator', title: 'Operator', screen: OperatorSettingsScreen },
  ...(import.meta.env.DEV ? [devRoute()] : []),
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
    label: 'Billing',
    items: [
      { path: '/tariffs', label: 'Tariffs', icon: Tags },
      { path: '/driver-groups', label: 'Driver groups', icon: UsersRound },
      { path: '/billing-accounts', label: 'Billing accounts', icon: Building2 },
      { path: '/cdrs', label: 'Charging records', icon: Receipt },
      { path: '/documents', label: 'Documents', icon: FileText },
      { path: '/reports', label: 'Reports', icon: PieChart },
    ],
  },
  {
    label: 'Settings',
    items: [
      { path: '/team', label: 'Team', icon: Users },
      { path: '/operator', label: 'Operator', icon: Settings },
    ],
  },
  ...(import.meta.env.DEV
    ? [{ label: 'Dev', items: [{ path: '/dev', label: 'Phone & services', icon: Smartphone }] }]
    : []),
];

export function titleFor(pathname: string): string {
  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return route?.title ?? 'Voltara CSMS';
}
