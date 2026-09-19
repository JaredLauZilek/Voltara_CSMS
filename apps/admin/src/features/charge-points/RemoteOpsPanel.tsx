import { useEffect, useState } from 'react';
import { Badge, C, Modal } from '@voltara/ui';
import { formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useIdTags } from '@/features/id-tags';
import { useRemoteOps } from './hooks';
import { COMMAND_STATUS_LABELS, REMOTE_OP_LABELS } from './types';
import type {
  ChargePointWithConnectors,
  CommandStatus,
  RemoteCommand,
  RemoteCommandActionUi,
  RemoteOpInput,
} from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 6,
};

/**
 * Remote operations for one charger: the buttons, a confirm step per action,
 * and the tray showing each command move queued → sent → settled.
 *
 * Every action goes through remote_commands — the UI never reaches the
 * gateway (CLAUDE.md §6). Viewers see nothing here: the insert policy would
 * refuse them anyway, and a button that always fails is worse than none.
 */
export function RemoteOpsPanel({ cp }: { cp: ChargePointWithConnectors }) {
  const { tenantRole } = useAuth();
  const { commands, issue, dismiss } = useRemoteOps(cp.id);
  const [pending, setPending] = useState<RemoteCommandActionUi | null>(null);

  useEffect(() => {
    issue.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (tenantRole === 'viewer') return null;

  const online = cp.connection_state === 'online';
  const actions: RemoteCommandActionUi[] = [
    'RemoteStartTransaction',
    'RemoteStopTransaction',
    'UnlockConnector',
    'ChangeAvailability',
    'TriggerMessage',
    'Reset',
    'ClearCache',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {actions.map((a) => (
          <button
            key={a}
            onClick={() => setPending(a)}
            disabled={!online}
            title={online ? undefined : 'The charger is offline — commands would fail immediately.'}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: `1px solid ${a === 'Reset' ? C.errorBg : C.border}`,
              background: C.white,
              color: a === 'Reset' ? C.error : C.green,
              fontFamily: 'Figtree',
              fontSize: 12,
              fontWeight: 700,
              cursor: online ? 'pointer' : 'not-allowed',
              opacity: online ? 1 : 0.5,
            }}
          >
            {REMOTE_OP_LABELS[a]}
          </button>
        ))}
      </div>
      {!online && (
        <div style={{ fontSize: 12, color: C.slate }}>
          Remote operations need the charger online. Commands sent to an offline unit fail
          immediately rather than waiting silently.
        </div>
      )}

      <CommandTray commands={commands} onDismiss={dismiss} />

      {pending && (
        <RemoteOpModal
          cp={cp}
          action={pending}
          isSending={issue.isPending}
          error={issue.error ? (issue.error as Error).message : null}
          onClose={() => setPending(null)}
          onConfirm={(op) => issue.mutate(op, { onSuccess: () => setPending(null) })}
        />
      )}
    </div>
  );
}

const TONE: Record<CommandStatus, string> = {
  queued: 'Queued',
  sent: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  timeout: 'Timeout',
  failed: 'Failed',
};

/** Recent commands from this session and where each one is in its lifecycle. */
export function CommandTray({
  commands,
  onDismiss,
}: {
  commands: RemoteCommand[];
  onDismiss?: (id: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {commands.map((c) => {
        const status = c.status as CommandStatus;
        const settled = status !== 'queued' && status !== 'sent';
        const response = c.response as { status?: string } | null;
        return (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              background: C.seasalt,
              border: `1px solid ${C.border}`,
              fontSize: 12,
            }}
          >
            {!settled && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: C.info,
                  flexShrink: 0,
                  animation: 'voltara-pulse 1.4s ease-in-out infinite',
                }}
              />
            )}
            <span style={{ fontWeight: 700, color: C.ink }}>
              {REMOTE_OP_LABELS[c.action as RemoteCommandActionUi] ?? c.action}
            </span>
            <Badge status={TONE[status] ?? COMMAND_STATUS_LABELS[status]} />
            <span
              style={{ color: C.slate, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {c.error
                ? c.error
                : response?.status
                  ? `Charger answered ${response.status}`
                  : status === 'sent'
                    ? 'Waiting for the charger…'
                    : status === 'queued'
                      ? 'Handing to the gateway…'
                      : ''}
            </span>
            <span style={{ marginLeft: 'auto', color: C.slate, whiteSpace: 'nowrap' }}>
              {formatDateTime(c.responded_at ?? c.created_at)}
            </span>
            {settled && onDismiss && (
              <button
                onClick={() => onDismiss(c.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: C.slate,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The confirm step. Each action collects only what its OCPP payload needs. */
function RemoteOpModal({
  cp,
  action,
  isSending,
  error,
  onClose,
  onConfirm,
}: {
  cp: ChargePointWithConnectors;
  action: RemoteCommandActionUi;
  isSending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (op: RemoteOpInput) => void;
}) {
  const { data: idTags = [] } = useIdTags();
  const firstConnector = cp.connectors[0]?.ocpp_connector_id ?? 1;
  const [connectorId, setConnectorId] = useState<number>(firstConnector);
  const [idTag, setIdTag] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [resetType, setResetType] = useState<'Soft' | 'Hard'>('Soft');
  const [availability, setAvailability] = useState<'Operative' | 'Inoperative'>('Operative');
  const [wholeCharger, setWholeCharger] = useState(false);
  const [trigger, setTrigger] = useState('StatusNotification');

  const activeTags = idTags.filter((t) => t.status === 'active');
  const chargingConnector = cp.connectors.find((c) =>
    ['Charging', 'SuspendedEV', 'SuspendedEVSE', 'Preparing', 'Finishing'].includes(c.status),
  );

  const build = (): RemoteOpInput | null => {
    switch (action) {
      case 'RemoteStartTransaction':
        return idTag ? { action, payload: { idTag, connectorId } } : null;
      case 'RemoteStopTransaction': {
        const n = Number(transactionId);
        return Number.isInteger(n) && transactionId !== ''
          ? { action, payload: { transactionId: n } }
          : null;
      }
      case 'Reset':
        return { action, payload: { type: resetType } };
      case 'UnlockConnector':
        return { action, payload: { connectorId } };
      case 'ChangeAvailability':
        return {
          action,
          payload: { connectorId: wholeCharger ? 0 : connectorId, type: availability },
        };
      case 'TriggerMessage':
        return {
          action,
          payload:
            trigger === 'BootNotification' || trigger === 'Heartbeat'
              ? { requestedMessage: trigger }
              : { requestedMessage: trigger, connectorId },
        };
      case 'ClearCache':
        return { action, payload: {} };
      case 'GetConfiguration':
        return { action, payload: {} };
      default:
        return null;
    }
  };

  const op = build();
  const canSend = Boolean(op) && !isSending;

  const explain: Record<RemoteCommandActionUi, string> = {
    RemoteStartTransaction:
      'Starts charging on the chosen connector as if the tag had been presented. The car must already be plugged in.',
    RemoteStopTransaction:
      'Stops the running transaction. The connector goes to Finishing until the cable is removed.',
    Reset:
      'Soft restarts the charger software; Hard power-cycles it. Any running session is stopped.',
    UnlockConnector:
      'Releases the cable lock on the chosen connector. Ends the session if one is running.',
    ChangeAvailability:
      'Inoperative takes the connector (or the whole charger) out of service until set back to Operative.',
    ChangeConfiguration: 'Writes one configuration key on the charger.',
    GetConfiguration: 'Asks the charger for its full configuration and stores the answer here.',
    TriggerMessage: 'Asks the charger to send a message now — useful to refresh a stale status.',
    ClearCache: "Clears the charger's local authorization cache.",
  };

  return (
    <Modal
      title={REMOTE_OP_LABELS[action]}
      subtitle={cp.ocpp_identity}
      onClose={onClose}
      width={520}
    >
      <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.6 }}>{explain[action]}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {(action === 'RemoteStartTransaction' ||
          action === 'UnlockConnector' ||
          action === 'ChangeAvailability' ||
          (action === 'TriggerMessage' &&
            trigger !== 'BootNotification' &&
            trigger !== 'Heartbeat')) && (
          <div>
            <label style={labelStyle}>Connector</label>
            <select
              value={connectorId}
              onChange={(e) => setConnectorId(Number(e.target.value))}
              disabled={action === 'ChangeAvailability' && wholeCharger}
              style={inputStyle}
            >
              {cp.connectors.map((c) => (
                <option key={c.id} value={c.ocpp_connector_id}>
                  Connector {c.ocpp_connector_id} · {c.status}
                </option>
              ))}
            </select>
          </div>
        )}

        {action === 'RemoteStartTransaction' && (
          <div>
            <label style={labelStyle}>Charge as</label>
            <select value={idTag} onChange={(e) => setIdTag(e.target.value)} style={inputStyle}>
              <option value="">— Choose an ID tag —</option>
              {activeTags.map((t) => (
                <option key={t.id} value={t.tag}>
                  {t.label ? `${t.label} · ${t.tag}` : t.tag}
                </option>
              ))}
            </select>
            {activeTags.length === 0 && (
              <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
                No active ID tags. Add one under Operations → ID tags first.
              </div>
            )}
          </div>
        )}

        {action === 'RemoteStopTransaction' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Transaction ID</label>
            <input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="From the running session"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
              {chargingConnector
                ? `Connector ${chargingConnector.ocpp_connector_id} is ${chargingConnector.status}. The transaction ID is on the session under the Sessions tab.`
                : 'No connector reports a running session right now.'}
            </div>
          </div>
        )}

        {action === 'Reset' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['Soft', 'Hard'] as const).map((t) => (
                <Pill key={t} active={resetType === t} onClick={() => setResetType(t)} label={t} />
              ))}
            </div>
          </div>
        )}

        {action === 'ChangeAvailability' && (
          <>
            <div>
              <label style={labelStyle}>Set to</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Operative', 'Inoperative'] as const).map((t) => (
                  <Pill
                    key={t}
                    active={availability === t}
                    onClick={() => setAvailability(t)}
                    label={t}
                  />
                ))}
              </div>
            </div>
            <label
              style={{
                gridColumn: '1/-1',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: C.slate,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={wholeCharger}
                onChange={(e) => setWholeCharger(e.target.checked)}
                style={{ accentColor: C.green }}
              />
              Apply to the whole charger (all connectors)
            </label>
          </>
        )}

        {action === 'TriggerMessage' && (
          <div>
            <label style={labelStyle}>Message</label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={inputStyle}>
              {['StatusNotification', 'Heartbeat', 'MeterValues', 'BootNotification'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: C.error,
            fontWeight: 600,
            padding: '10px 12px',
            background: C.errorBg,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '10px 20px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.slate,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => op && onConfirm(op)}
          disabled={!canSend}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: !canSend ? C.slate : action === 'Reset' ? C.error : C.green,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: canSend ? 'pointer' : isSending ? 'wait' : 'not-allowed',
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {isSending ? 'Sending…' : `Send ${REMOTE_OP_LABELS[action].toLowerCase()}`}
        </button>
      </div>
    </Modal>
  );
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 99,
        border: `2px solid ${active ? C.green : C.border}`,
        background: active ? C.honeydew : C.white,
        color: active ? C.green : C.slate,
        fontFamily: 'Figtree',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
