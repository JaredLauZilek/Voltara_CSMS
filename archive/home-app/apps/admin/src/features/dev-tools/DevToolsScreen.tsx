import { useState } from 'react';
import { C, STATUS_COLORS } from '@voltara/ui';
import { usePhoneLink, useServiceStatus } from './hooks';
import type { ServiceState } from './types';

const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
};
const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 10,
};
const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  color: C.ink,
};

const STATE_PILL: Record<ServiceState, { label: string; pill: string }> = {
  up: { label: 'Up', pill: 'Online' },
  down: { label: 'Down', pill: 'Offline' },
  checking: { label: 'Checking…', pill: 'Unknown' },
};

const SEEDED = [
  ['owner@dev.voltara.com.my', 'Homeowner — owns HC-DEMO-0001 and the simulator'],
  ['family@dev.voltara.com.my', 'Household member'],
  ['installer@dev.voltara.com.my', 'Installer (Voltara in-house dealer)'],
  ['dealer@dev.voltara.com.my', 'Dealer admin (Demo Dealer)'],
  ['admin@dev.voltara.com.my', 'Voltara staff admin'],
  ['support@dev.voltara.com.my', 'Voltara staff support'],
] as const;

/** The QR comes with a fixed pixel size; let the viewBox scale to its box instead. */
function fitSvg(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%" style="display:block">`;
  });
}

/**
 * Dev-only page (never registered in production builds): the phone link for
 * the home app as a QR, whether local services answer, and the seeded
 * accounts. Data comes from scripts/dev.mjs (`pnpm dev`), which writes
 * public/dev-phone.json.
 */
export function DevToolsScreen() {
  const { data: phone } = usePhoneLink();
  const { data: services } = useServiceStatus();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!phone?.url) return;
    await navigator.clipboard.writeText(phone.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
      <div style={card}>
        <div style={label}>Voltara Home on your phone</div>
        {phone?.url ? (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 236,
                height: 236,
                flexShrink: 0,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                padding: 8,
                background: C.white,
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
              dangerouslySetInnerHTML={{ __html: fitSvg(phone.qrSvg ?? '') }}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                Scan with the iPhone camera — it opens in Expo Go. Or paste the address into Expo Go
                by hand.
              </p>
              <div
                style={{
                  ...mono,
                  padding: '10px 12px',
                  background: C.seasalt,
                  borderRadius: 8,
                  wordBreak: 'break-all',
                }}
              >
                {phone.url}
              </div>
              <button
                onClick={copy}
                style={{
                  marginTop: 10,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: C.green,
                  color: C.white,
                  fontFamily: 'Figtree',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied' : 'Copy address'}
              </button>
              <p style={{ margin: '12px 0 0', fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
                Dev mode signs the phone in as the seeded owner. Bluetooth is unavailable in Expo
                Go; the simulator charger works. If the app cannot connect, run{' '}
                <code style={mono}>pnpm dev</code> in the codespace again.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ padding: 32, color: C.slate, fontSize: 14, textAlign: 'center' }}>
            No phone link yet. Run <code style={mono}>pnpm dev</code> in the codespace; the QR
            appears here as soon as the tunnel is up.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        <div style={card}>
          <div style={label}>Services</div>
          {(
            [
              [
                'Expo dev server',
                services?.expo ?? 'checking',
                'Bundles the home app · :8081 → tunnel',
              ],
              [
                'Supabase (hosted)',
                services?.supabase ?? 'checking',
                'Auth, database, functions · Seoul',
              ],
            ] as const
          ).map(([name, state, hint]) => {
            const pill = STATE_PILL[state];
            const colours = STATUS_COLORS[pill.pill];
            return (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: `1px solid ${C.divider}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>{hint}</div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 99,
                    background: colours.bg,
                    color: colours.color,
                  }}
                >
                  {pill.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={card}>
          <div style={label}>Seeded accounts · password voltara-dev</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '8px 16px',
              fontSize: 13,
            }}
          >
            {SEEDED.map(([email, who]) => (
              <>
                <span key={`${email}-e`} style={mono}>
                  {email}
                </span>
                <span key={`${email}-w`} style={{ color: C.slate }}>
                  {who}
                </span>
              </>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
            Unclaimed units for the claim flow: <code style={mono}>HC-DEMO-0002</code> code{' '}
            <code style={mono}>246810</code> · <code style={mono}>HC-DEMO-0003</code> code{' '}
            <code style={mono}>135790</code>
          </div>
        </div>
      </div>
    </div>
  );
}
