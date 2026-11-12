import type { LucideIcon } from 'lucide-react';
import { C } from '../tokens';

interface Props {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

export function NavItem({ icon: Icon, label, active, badge, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        background: active ? C.honeydew : 'transparent',
        color: active ? C.green : C.slate,
        fontFamily: 'Figtree',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        width: '100%',
        textAlign: 'left',
        transition: 'background .15s, color .15s',
      }}
    >
      <span
        style={{
          width: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {badge && badge > 0 ? (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 99,
            background: '#C0321A',
            color: C.white,
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : active ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: C.green,
            flexShrink: 0,
          }}
        />
      ) : null}
    </button>
  );
}
