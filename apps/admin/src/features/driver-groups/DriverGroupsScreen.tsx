import { useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Toolbar } from '@voltara/ui';
import { formatDate } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { DriverGroupModal } from './DriverGroupModal';
import { useDriverGroups } from './hooks';
import { GROUP_KIND_LABELS } from './types';

export function DriverGroupsScreen() {
  const { tenantRole } = useAuth();
  const { data: groups = [], isLoading } = useDriverGroups();
  const [params, setParams] = useSearchParams();
  const modal = params.get('group');
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';
  const open = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('group', id);
    else p.delete('group');
    setParams(p, { replace: true });
  };
  const record = modal && modal !== 'new' ? (groups.find((g) => g.id === modal) ?? null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Driver groups"
          value={groups.length}
          sub="Whitelists with their own pricing"
          accent
        />
        <KPICard
          label="Members"
          value={groups.reduce((s, g) => s + g.member_count, 0)}
          sub="Tags and accounts"
        />
        <KPICard
          label="Resident groups"
          value={groups.filter((g) => g.kind === 'residents').length}
          sub="Condo / strata"
        />
        <KPICard
          label="Staff & fleet"
          value={groups.filter((g) => g.kind === 'staff' || g.kind === 'fleet').length}
          sub="Workplace charging"
        />
      </div>
      <Toolbar
        primaryLabel={canEdit ? '+ New Group' : undefined}
        onPrimary={canEdit ? () => open('new') : undefined}
      />
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Group', 'Kind', 'Members', 'Created'].map((h) => (
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
            {groups.map((g) => (
              <tr
                key={g.id}
                style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                onClick={() => open(g.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontWeight: 600, color: C.ink }}>{g.name}</div>
                  {g.description && (
                    <div style={{ fontSize: 12, color: C.slate }}>{g.description}</div>
                  )}
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge
                    status={GROUP_KIND_LABELS[g.kind] ?? g.kind}
                    override={{ bg: C.honeydew, color: C.green }}
                  />
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>{g.member_count}</td>
                <td style={{ padding: '13px 16px', color: C.slate }}>{formatDate(g.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && groups.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No driver groups yet.
          </div>
        )}
      </div>
      {(modal === 'new' || record) && (
        <DriverGroupModal key={modal} group={record} onClose={() => open(null)} />
      )}
    </div>
  );
}
