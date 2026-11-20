import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { C } from '@voltara/ui';
import { chargerQrUrl, formatGun } from '@voltara/shared';
import { downloadText } from '@/shared/lib/csv';
import type { ChargePointWithConnectors } from './types';

/**
 * The QR code a driver scans to open this charger in the app — one per gun,
 * so a twin charger gets a sticker beside each cable. The code is a web
 * address on our own domain carrying the charge point ID and the gun.
 */
export function ChargerQrCodes({ cp }: { cp: ChargePointWithConnectors }) {
  const guns = [...cp.connectors].sort((a, b) => a.ocpp_connector_id - b.ocpp_connector_id);
  if (guns.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {guns.map((g) => (
        <GunQr
          key={g.id}
          identity={cp.ocpp_identity}
          connectorId={g.ocpp_connector_id}
          lot={g.parking_lot}
        />
      ))}
    </div>
  );
}

function GunQr({
  identity,
  connectorId,
  lot,
}: {
  identity: string;
  connectorId: number;
  lot: string | null;
}) {
  const url = chargerQrUrl(identity, connectorId);
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Dark modules in plain black: stickers are printed, and scanners want contrast.
    QRCode.toString(url, { type: 'svg', margin: 1, width: 512, errorCorrectionLevel: 'M' })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      style={{
        width: 188,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
        {formatGun(connectorId)}
        {lot ? <span style={{ color: C.slate, fontWeight: 600 }}> · Lot {lot}</span> : null}
      </div>
      {svg ? (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt={`QR code for ${identity} ${formatGun(connectorId)}`}
          width={160}
          height={160}
        />
      ) : (
        <div style={{ width: 160, height: 160, background: C.seasalt, borderRadius: 8 }} />
      )}
      <div
        style={{
          fontSize: 10,
          color: C.slate,
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          textAlign: 'center',
        }}
      >
        {url}
      </div>
      <button
        onClick={() =>
          svg && downloadText(`qr_${identity}_gun-${connectorId}.svg`, svg, 'image/svg+xml')
        }
        disabled={!svg}
        style={{
          border: 'none',
          background: 'transparent',
          color: C.green,
          fontFamily: 'Figtree',
          fontSize: 12,
          fontWeight: 700,
          cursor: svg ? 'pointer' : 'default',
          padding: 0,
        }}
      >
        ↓ Download for printing
      </button>
    </div>
  );
}
