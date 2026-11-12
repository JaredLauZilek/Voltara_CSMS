import { Badge, STATUS_COLORS } from '@voltara/ui';
import {
  CHARGER_LIFECYCLES,
  CHARGER_LIFECYCLE_LABELS,
  CHARGER_LIFECYCLE_PILL,
  stateLabel,
} from '@voltara/shared';
import type { ChargerLifecycle, ChargerState } from '@voltara/shared';
import { chargerStatePill } from './types';
import type { ChargerRow } from './types';

export function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  if (!(CHARGER_LIFECYCLES as readonly string[]).includes(lifecycle)) {
    return <Badge status={lifecycle} />;
  }
  const l = lifecycle as ChargerLifecycle;
  return (
    <Badge
      status={CHARGER_LIFECYCLE_LABELS[l]}
      override={STATUS_COLORS[CHARGER_LIFECYCLE_PILL[l]]}
    />
  );
}

/** Live state pill: the OCPP vocabulary from STATUS_COLORS, or Offline when stale. */
export function StateBadge({ row }: { row: Pick<ChargerRow, 'seen_recently' | 'last_state'> }) {
  const pill = chargerStatePill(row);
  const label = pill === 'Offline' ? 'Offline' : stateLabel(pill as ChargerState);
  return <Badge status={label} override={STATUS_COLORS[pill] ?? STATUS_COLORS.Unknown} />;
}

const SEVERITY_FAMILY: Record<string, string> = {
  info: 'Sent',
  warning: 'Pending',
  error: 'Cancelled',
};

export function SeverityBadge({ severity }: { severity: string }) {
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return <Badge status={label} override={STATUS_COLORS[SEVERITY_FAMILY[severity] ?? 'Inactive']} />;
}
