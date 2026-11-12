import { C, ChargerIcon, STATUS_COLORS } from '@voltara/ui';
import { formatGun } from '@voltara/shared';
import type { Connector } from './types';

/**
 * One connector, at a glance.
 *
 * The unit an operator actually cares about is the connector, not the charge
 * point: a two-gun unit can have one plug charging and one faulted, and a view
 * that collapses them to a single row hides exactly the problem worth seeing.
 * Colour carries the status, but the label repeats it — colour alone fails for
 * colour-blind operators and in a sunlit car park.
 */
export function ConnectorTile({
  identity,
  connector,
  status,
  onClick,
}: {
  identity: string;
  connector: Connector;
  status: string;
  onClick?: () => void;
}) {
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.Unknown;

  return (
    <button
      onClick={onClick}
      title={[identity, formatGun(connector.ocpp_connector_id), connector.parking_lot, status]
        .filter(Boolean)
        .join(' · ')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'Figtree',
        minWidth: 84,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.slate,
          maxWidth: 96,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {identity}
      </span>

      <ChargerIcon color={palette.color} height={40} />

      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.slate,
          maxWidth: 96,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {formatGun(connector.ocpp_connector_id)}
        {connector.parking_lot ? ` · ${connector.parking_lot}` : ''}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: palette.color }}>{status}</span>
    </button>
  );
}
