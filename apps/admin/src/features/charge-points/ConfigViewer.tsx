import { useMemo, useState } from 'react';
import { C } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { useRemoteOps } from './hooks';
import { CommandTray } from './RemoteOpsPanel';
import type { ChargePointWithConnectors } from './types';

/**
 * The charger's configuration as last reported (GetConfiguration snapshot).
 * "Refresh" asks the charger again through the command bus; editing a key
 * sends ChangeConfiguration. AuthorizationKey is stored redacted and cannot be
 * read back — rotation is a separate flow (CLAUDE.md §10).
 */
export function ConfigViewer({ cp }: { cp: ChargePointWithConnectors }) {
  const { tenantRole } = useAuth();
  const { commands, issue, dismiss } = useRemoteOps(cp.id);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const canOperate = tenantRole !== 'viewer';
  const online = cp.connection_state === 'online';
  const config = useMemo(() => (cp.config ?? {}) as Record<string, unknown>, [cp.config]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(config)
      .filter(([k]) => !q || k.toLowerCase().includes(q))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [config, search]);

  const refresh = () => issue.mutate({ action: 'GetConfiguration', payload: {} });
  const save = (key: string) => {
    issue.mutate(
      { action: 'ChangeConfiguration', payload: { key, value: draft } },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 220 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter keys…"
            style={{
              width: '100%',
              padding: '8px 14px 8px 34px',
              borderRadius: 99,
              border: `1px solid ${C.border}`,
              fontFamily: 'Figtree',
              fontSize: 13,
              outline: 'none',
              background: C.white,
              boxSizing: 'border-box',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.slate,
            }}
          >
            ⌕
          </span>
        </div>
        <span style={{ fontSize: 12, color: C.slate }}>{Object.keys(config).length} keys</span>
        {canOperate && (
          <button
            onClick={refresh}
            disabled={!online || issue.isPending}
            title={online ? 'Ask the charger for its configuration' : 'Charger is offline'}
            style={{
              marginLeft: 'auto',
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              background: online ? C.green : C.slate,
              color: C.white,
              fontFamily: 'Figtree',
              fontSize: 13,
              fontWeight: 700,
              cursor: online ? 'pointer' : 'not-allowed',
              opacity: online ? 1 : 0.6,
            }}
          >
            Refresh from charger
          </button>
        )}
      </div>

      <CommandTray commands={commands} onDismiss={dismiss} />

      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            {Object.keys(config).length === 0
              ? 'No configuration stored yet. It is read automatically after the charger boots.'
              : 'No keys match.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.seasalt }}>
                {['Key', 'Value', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.slate,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value]) => {
                const secret = key.toLowerCase() === 'authorizationkey';
                const isEditing = editing === key;
                return (
                  <tr key={key} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td
                      style={{
                        padding: '11px 16px',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: C.ink,
                        width: '40%',
                      }}
                    >
                      {key}
                    </td>
                    <td style={{ padding: '11px 16px', color: C.slate }}>
                      {isEditing ? (
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') save(key);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: `1px solid ${C.green}`,
                            fontFamily: 'monospace',
                            fontSize: 12,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {secret
                            ? '••••••••'
                            : value === undefined || value === null
                              ? '—'
                              : String(value)}
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '11px 16px',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        width: 160,
                      }}
                    >
                      {canOperate &&
                        !secret &&
                        online &&
                        (isEditing ? (
                          <>
                            <SmallButton
                              onClick={() => save(key)}
                              primary
                              disabled={issue.isPending}
                            >
                              {issue.isPending ? 'Sending…' : 'Set'}
                            </SmallButton>{' '}
                            <SmallButton onClick={() => setEditing(null)}>Cancel</SmallButton>
                          </>
                        ) : (
                          <SmallButton
                            onClick={() => {
                              setEditing(key);
                              setDraft(value == null ? '' : String(value));
                            }}
                          >
                            Edit
                          </SmallButton>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px',
        borderRadius: 8,
        border: `1px solid ${primary ? C.green : C.border}`,
        background: primary ? C.green : C.white,
        color: primary ? C.white : C.slate,
        fontFamily: 'Figtree',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'wait' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
