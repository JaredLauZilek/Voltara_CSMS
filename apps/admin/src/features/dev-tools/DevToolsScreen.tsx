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

const STATE_PILL: Record<
  ServiceState,
  { label: string; colours: (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS] }
> = {
  up: { label: 'Up', colours: STATUS_COLORS.green },
  down: { label: 'Down', colours: STATUS_COLORS.red },
  checking: { label: 'Checking…', colours: STATUS_COLORS.grey },
};

/**
 * Dev-only page (never registered in production builds): the phone link for
 * the driver app as a QR, and whether each local service answers. Data comes
 * from scripts/dev.mjs (`pnpm dev:all`), which writes public/dev-phone.json.
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
        <div style={label}>Driver app on your phone</div>
        {phone?.url ? (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 200,
                height: 200,
                flexShrink: 0,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                padding: 8,
                background: C.white,
              }}
              dangerouslySetInnerHTML={{ __html: phone.qrSvg ?? '' }}
            />
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: C.ink }}>
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
              <p style={{ margin: '12px 0 0', fontSize: 12, color: C.slate }}>
                The address never changes. If the app says it cannot connect, the dev server is
                asleep — run <code style={mono}>pnpm dev:all</code> in the codespace and reload.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ padding: 32, color: C.slate, fontSize: 14, textAlign: 'center' }}>
            No phone link yet. Run <code style={mono}>pnpm dev:all</code> in the codespace.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        <div style={card}>
          <div style={label}>Local services</div>
          {(
            [
              ['Supabase', services?.supabase ?? 'checking', 'Auth, database, realtime · :54321'],
              ['OCPP gateway', services?.gateway ?? 'checking', 'Charger connections · :9221'],
              [
                'Expo dev server',
                services?.expo ?? 'checking',
                'Bundles the driver app · :8081 → tunnel',
              ],
            ] as const
          ).map(([name, state, hint]) => {
            const pill = STATE_PILL[state];
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
                    background: pill.colours.bg,
                    color: pill.colours.color,
                  }}
                >
                  {pill.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={card}>
          <div style={label}>Test data on staging</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '8px 16px',
              fontSize: 13,
            }}
          >
            <span style={{ color: C.slate }}>Join code</span>
            <span style={mono}>VANTAGE24</span>
            <span style={{ color: C.slate }}>Sites</span>
            <span>Voltara HQ · Petaling Jaya, Vantage Residences · Bangsar</span>
            <span style={{ color: C.slate }}>Fake session</span>
            <span style={mono}>pnpm sim:session --kwh 7.4 --idle-min 5</span>
          </div>
        </div>
      </div>
    </div>
  );
}
