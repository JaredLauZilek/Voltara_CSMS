// Route registry + nav structure. Adding a feature = one entry in ROUTES and
// one in NAV_SECTIONS (plus the feature folder). See CLAUDE.md §4.
import { lazy, Suspense, type ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Cpu,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Smartphone,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import { OverviewScreen } from '@/features/overview';
import { ChargersFeature } from '@/features/chargers';
import { OwnersScreen } from '@/features/owners';
import { DealersFeature } from '@/features/dealers';
import { ModelsScreen } from '@/features/models';
import { SupportScreen } from '@/features/support';
import { TeamScreen } from '@/features/team';
import { AuditLogScreen } from '@/features/audit-log';

export interface RouteDef {
  path: string;
  title: string;
  screen: ComponentType;
  /** Staff only (dealers never see it). */
  staffOnly?: boolean;
}

// Dev-only: the phone QR + local service health. The lazy import lives
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
  { path: '/chargers', title: 'Chargers', screen: ChargersFeature },
  { path: '/owners', title: 'Owners', screen: OwnersScreen },
  { path: '/dealers', title: 'Dealers', screen: DealersFeature },
  { path: '/models', title: 'Models & firmware', screen: ModelsScreen, staffOnly: true },
  { path: '/support', title: 'Support', screen: SupportScreen },
  { path: '/team', title: 'Team', screen: TeamScreen },
  { path: '/audit-log', title: 'Audit log', screen: AuditLogScreen, staffOnly: true },
  ...(import.meta.env.DEV ? [devRoute()] : []),
];

/** Where "/" lands. */
export const HOME_PATH = '/overview';

export interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
  staffOnly?: boolean;
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
    label: 'Fleet',
    items: [
      { path: '/chargers', label: 'Chargers', icon: Zap },
      { path: '/owners', label: 'Owners', icon: Users },
      { path: '/dealers', label: 'Dealers', icon: Building2 },
      { path: '/models', label: 'Models & firmware', icon: Cpu, staffOnly: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/support', label: 'Support', icon: LifeBuoy },
      { path: '/audit-log', label: 'Audit log', icon: ScrollText, staffOnly: true },
    ],
  },
  {
    label: 'Settings',
    items: [{ path: '/team', label: 'Team', icon: UsersRound }],
  },
  ...(import.meta.env.DEV
    ? [{ label: 'Dev', items: [{ path: '/dev', label: 'Phone & services', icon: Smartphone }] }]
    : []),
];

export function titleFor(pathname: string): string {
  const route = ROUTES.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return route?.title ?? 'Voltara Home';
}
