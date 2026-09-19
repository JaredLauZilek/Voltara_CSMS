import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, C } from '@voltara/ui';
import { formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { IssueModal, useChargePointIssues } from '@/features/issues';
import { ChargePointSessions } from '@/features/sessions';
import {
  useChargePointDetail,
  useConnectionEvents,
  useDeleteChargePoint,
  useRecentFrames,
  useStatusEvents,
  useUpdateChargePoint,
  useUptime,
} from './hooks';
import { ConnectorTile } from './ConnectorTile';
import { ChargePointModal } from './ChargePointModal';
import { ConfigViewer } from './ConfigViewer';
import { RemoteOpsPanel } from './RemoteOpsPanel';
import { DETAIL_TABS, DETAIL_TAB_LABELS, displayStatus, gatewayDisplayHost } from './types';
import type { DetailTab } from './types';
import type { OcppFrame } from './api';

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  'wss://voltara-gateway-staging.fly.dev';

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

/**
 * One charger. Live: the detail cache is patched from the tenant Broadcast
 * channel, so a status flip shows without a refetch. The tab is in the URL
 * (`?tab=logs`) so a support link lands on the right view.
 */
export function ChargePointDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { tenantRole } = useAuth();
  const tabParam = params.get('tab');
  const tab: DetailTab = DETAIL_TABS.includes(tabParam as DetailTab)
    ? (tabParam as DetailTab)
    : 'overview';

  const { data: cp, isLoading } = useChargePointDetail(id);
  const { data: uptime = [] } = useUptime(30);
  const { data: openIssues = [] } = useChargePointIssues(id);
  const updateMut = useUpdateChargePoint();
  const deleteMut = useDeleteChargePoint();
  const [showEdit, setShowEdit] = useState(false);
  const [showIssue, setShowIssue] = useState(false);

  useEffect(() => {
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEdit]);

  const setTab = (next: DetailTab) => {
    const p = new URLSearchParams(params);
    if (next === 'overview') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  if (isLoading) return null;
  if (!cp) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        Charger not found.{' '}
        <Link to="/charge-points" style={{ color: C.green, fontWeight: 600 }}>
          Back to chargers
        </Link>
      </div>
    );
  }

  const connectionBadge =
    cp.connection_state === 'online'
      ? 'Online'
      : cp.lifecycle === 'pending'
        ? 'Never Connected'
        : 'Offline';
  const plaintext = cp.security_profile === 1;
  const openMode = cp.security_profile === 0;
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';
  const canOperate = tenantRole !== 'viewer';
  const up = uptime.find((u) => u.charge_point_id === cp.id);
  const activeIssues = openIssues.filter((i) => i.status === 'open' || i.status === 'in_progress');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        to="/charge-points"
        style={{ fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: 'none' }}
      >
        ‹ Chargers
      </Link>

      {/* Header */}
      <div
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: C.honeydew,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            color: C.green,
            flexShrink: 0,
          }}
        >
          ⚡
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              {cp.name}
            </span>
            <Badge status={connectionBadge} />
            {cp.lifecycle === 'pending' && <Badge status="Pending" />}
            {(plaintext || openMode) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 99,
                  background: C.warningBg,
                  color: C.warning,
                }}
              >
                {openMode ? 'open · no auth' : 'ws:// allowed'}
              </span>
            )}
            {activeIssues.length > 0 && (
              <button
                onClick={() => setTab('overview')}
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
              >
                <Badge status="Faulted" override={{ bg: C.errorBg, color: C.error }} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4, fontFamily: 'monospace' }}>
            {cp.ocpp_identity}
            {cp.location_name ? (
              <span style={{ fontFamily: 'Figtree' }}> · {cp.location_name}</span>
            ) : null}
            {up?.uptime_pct != null && (
              <span style={{ fontFamily: 'Figtree' }}>
                {' '}
                · {up.uptime_pct.toFixed(1)}% uptime · 30d
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {canOperate && (
            <button onClick={() => setShowIssue(true)} style={secondaryButton}>
              Report issue
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowEdit(true)} style={secondaryButton}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: `1px solid ${tab === t ? C.green : C.border}`,
              background: tab === t ? C.green : C.white,
              color: tab === t ? C.white : C.slate,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Figtree',
              cursor: 'pointer',
            }}
          >
            {DETAIL_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Connectors + remote operations */}
          <div style={card}>
            <div style={sectionTitle}>Connectors</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {cp.connectors.map((connector) => (
                <ConnectorTile
                  key={connector.id}
                  identity={cp.ocpp_identity}
                  connector={connector}
                  status={displayStatus(cp, connector)}
                />
              ))}
              {cp.connectors.length === 0 && (
                <span style={{ fontSize: 13, color: C.slate }}>No connectors reported.</span>
              )}
            </div>
            {canOperate && (
              <>
                <div style={{ ...sectionTitle, marginTop: 6 }}>Remote operations</div>
                <RemoteOpsPanel cp={cp} />
              </>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div style={card}>
              <div style={sectionTitle}>Reported by the charger</div>
              {cp.lifecycle === 'pending' ? (
                <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.6 }}>
                  Nothing yet — this charger has never completed a boot. Vendor, model and firmware
                  appear here after its first successful connection.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Meta label="Vendor" value={cp.vendor_reported} />
                  <Meta label="Model" value={cp.model_reported} />
                  <Meta label="Firmware" value={cp.firmware_version} />
                  <Meta label="Serial" value={cp.serial_number} />
                  <Meta
                    label="Last seen"
                    value={cp.last_seen_at ? formatDateTime(cp.last_seen_at) : null}
                  />
                  <Meta
                    label="Last boot"
                    value={cp.last_boot_at ? formatDateTime(cp.last_boot_at) : null}
                  />
                </div>
              )}
            </div>

            <div style={card}>
              <div style={sectionTitle}>Connection settings</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Setting
                  label={plaintext ? 'Server URL (TLS off)' : 'Server URL (TLS on)'}
                  value={gatewayDisplayHost(GATEWAY_URL, plaintext)}
                />
                <Setting label="Charge Point ID / username" value={cp.ocpp_identity} />
                <Setting
                  label="OCPP version"
                  value={`${cp.ocpp_version}J · security profile ${cp.security_profile}`}
                />
              </div>
              <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
                {openMode
                  ? 'Open mode: the charger needs no username or password — only its ID. TLS on or off both work.'
                  : 'The password is stored only as a hash and cannot be shown again. If it is lost, delete this charger and register it again.'}
              </div>
            </div>
          </div>

          {activeIssues.length > 0 && (
            <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span style={sectionTitle}>Open issues</span>
                <Link
                  to={`/issues?q=${encodeURIComponent(cp.ocpp_identity)}`}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.green,
                    textDecoration: 'none',
                  }}
                >
                  All issues ›
                </Link>
              </div>
              {activeIssues.map((i) => (
                <Link
                  key={i.id}
                  to={`/issues?issue=${i.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 24px',
                    borderBottom: `1px solid ${C.divider}`,
                    fontSize: 13,
                    textDecoration: 'none',
                    color: C.ink,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{i.title}</span>
                  {i.ocpp_connector_id ? (
                    <span style={{ color: C.slate }}>connector {i.ocpp_connector_id}</span>
                  ) : null}
                  <span style={{ marginLeft: 'auto', color: C.slate, fontSize: 12 }}>
                    {formatDateTime(i.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'sessions' && <ChargePointSessions chargePointId={cp.id} />}

      {tab === 'config' && <ConfigViewer cp={cp} />}

      {tab === 'logs' && <LogsTab chargePointId={cp.id} />}

      {showEdit && (
        <ChargePointModal
          chargePoint={cp}
          onClose={() => setShowEdit(false)}
          onSave={(patch) =>
            updateMut.mutate({ id: cp.id, patch }, { onSuccess: () => setShowEdit(false) })
          }
          onDelete={() => deleteMut.mutate(cp.id, { onSuccess: () => navigate('/charge-points') })}
          isSaving={updateMut.isPending}
          saveError={updateMut.error ? (updateMut.error as Error).message : null}
        />
      )}

      {showIssue && (
        <IssueModal issue={null} presetChargePointId={cp.id} onClose={() => setShowIssue(false)} />
      )}
    </div>
  );
}

const secondaryButton: React.CSSProperties = {
  padding: '9px 18px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.white,
  color: C.green,
  fontFamily: 'Figtree',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

/** Connection history, status history, and the raw frame log for one charger. */
function LogsTab({ chargePointId }: { chargePointId: string }) {
  const { data: events = [] } = useConnectionEvents(chargePointId);
  const { data: statuses = [] } = useStatusEvents(chargePointId);
  const { data: frames = [] } = useRecentFrames(chargePointId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}
      >
        {/* Connection history — the commissioning debug view */}
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={sectionTitle}>Connection history</div>
          </div>
          {events.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: C.slate,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              No connection attempts recorded. The charger has not reached the platform yet — check
              its network, the server URL (including the port), and that its ID matches exactly.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td
                      style={{
                        padding: '10px 24px',
                        color: C.slate,
                        whiteSpace: 'nowrap',
                        width: 170,
                      }}
                    >
                      {formatDateTime(e.recorded_at)}
                    </td>
                    <td style={{ padding: '10px 12px', width: 110 }}>
                      <Badge
                        status={
                          e.event === 'connected'
                            ? 'Online'
                            : e.event === 'rejected'
                              ? 'Rejected'
                              : 'Offline'
                        }
                      />
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        color: e.event === 'rejected' ? C.error : C.slate,
                        fontSize: 12,
                      }}
                    >
                      {e.event === 'rejected'
                        ? (e.close_reason ?? 'rejected')
                        : e.event === 'disconnected'
                          ? [e.close_code, e.close_reason].filter(Boolean).join(' · ') ||
                            'connection closed'
                          : (e.remote_address ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={sectionTitle}>Status history</div>
          </div>
          {statuses.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 13 }}>
              No status notifications yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td
                      style={{
                        padding: '10px 24px',
                        color: C.slate,
                        whiteSpace: 'nowrap',
                        width: 170,
                      }}
                    >
                      {formatDateTime(s.recorded_at)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        color: C.slate,
                        whiteSpace: 'nowrap',
                        width: 60,
                      }}
                    >
                      {s.ocpp_connector_id === 0
                        ? 'unit'
                        : `PL ${String(s.ocpp_connector_id).padStart(2, '0')}`}
                    </td>
                    <td style={{ padding: '10px 12px', width: 110 }}>
                      <Badge status={s.status} />
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        color: s.error_code ? C.error : C.slate,
                        fontSize: 12,
                      }}
                    >
                      {[s.error_code, s.vendor_error_code, s.info].filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={sectionTitle}>OCPP messages · last {frames.length || '—'}</span>
          <Link
            to={`/ocpp-logs?cp=${chargePointId}`}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontWeight: 600,
              color: C.green,
              textDecoration: 'none',
            }}
          >
            Full log ›
          </Link>
        </div>
        {frames.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 13 }}>
            No frames yet. Every OCPP message this charger sends or receives will appear here.
          </div>
        ) : (
          <div>
            {frames.map((f) => (
              <FrameRow key={f.id} frame={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: value ? C.ink : C.slate, marginTop: 2 }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          width: 190,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          padding: '7px 10px',
          borderRadius: 8,
          background: C.seasalt,
          border: `1px solid ${C.border}`,
          fontSize: 12,
          fontFamily: 'monospace',
          color: C.ink,
          overflow: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </code>
    </div>
  );
}

/** One frame; click to expand the payload. */
function FrameRow({ frame }: { frame: OcppFrame }) {
  const [open, setOpen] = useState(false);
  const isError = frame.message_type === 4;
  return (
    <div
      style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
      onClick={() => setOpen((v) => !v)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 24px',
          fontSize: 12,
        }}
      >
        <span style={{ color: C.slate, whiteSpace: 'nowrap', width: 160, flexShrink: 0 }}>
          {formatDateTime(frame.recorded_at)}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: frame.direction === 'in' ? C.info : C.green,
            width: 34,
            flexShrink: 0,
          }}
        >
          {frame.direction === 'in' ? '→ in' : '← out'}
        </span>
        <span style={{ fontWeight: 600, color: isError ? C.error : C.ink }}>
          {frame.action ?? (isError ? 'Error' : '—')}
          {isError && frame.error_code ? ` · ${frame.error_code}` : ''}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: C.slate,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 360,
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          {open ? '' : JSON.stringify(frame.payload ?? {})}
        </span>
      </div>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: '4px 24px 14px 230px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: C.ink,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(frame.payload ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}
