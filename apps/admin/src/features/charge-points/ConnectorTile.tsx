import { C, STATUS_COLORS } from '@voltara/ui';
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
      title={`${identity} · connector ${connector.ocpp_connector_id} · ${status}`}
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

      <span
        style={{
          width: 40,
          height: 52,
          borderRadius: 8,
          background: palette.bg,
          border: `1.5px solid ${palette.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          lineHeight: 1,
          color: palette.color,
        }}
      >
        ⚡
      </span>

      <span style={{ fontSize: 10, fontWeight: 600, color: C.slate }}>
        PL {String(connector.ocpp_connector_id).padStart(2, '0')}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: palette.color }}>{status}</span>
    </button>
  );
}
