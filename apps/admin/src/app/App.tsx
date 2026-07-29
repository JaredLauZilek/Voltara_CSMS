import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { C, NavItem, VoltaraLogo, useViewport } from '@voltara/ui';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from './auth';
import { NAV_SECTIONS, ROUTES, titleFor } from './routes';

const COLLAPSED_KEY = 'voltara-csms.nav.collapsed';

function useTenant() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function App() {
  const { session } = useAuth();
  const { data: tenant } = useTenant();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const { isCompact } = useViewport();
  // Drawer for iPad / phone / Galaxy Fold. Always-open on desktop.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer when the viewport widens back into desktop range, so the
  // sidebar doesn't get stuck "open" after a rotation back to landscape iPad.
  useEffect(() => {
    if (!isCompact) setDrawerOpen(false);
  }, [isCompact]);

  // Prevent body scroll while the drawer is showing — otherwise the page
  // behind it scrolls when the user pans through nav items.
  useEffect(() => {
    if (isCompact && drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isCompact, drawerOpen]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  // On compact viewports the sidebar slides over the content rather than
  // taking up flex space. The aside keeps a fixed width either way so the
  // layout inside doesn't reflow when the drawer opens / closes.
  const SIDEBAR_W = 224;
  const sidebarStyle: React.CSSProperties = isCompact
    ? {
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        width: SIDEBAR_W,
        zIndex: 100,
        background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 12px',
        transform: `translateX(${drawerOpen ? '0' : `-${SIDEBAR_W + 4}px`})`,
        transition: 'transform 200ms ease',
        boxShadow: drawerOpen ? '0 10px 40px rgba(0,0,0,0.18)' : 'none',
        overflow: 'hidden',
      }
    : {
        width: SIDEBAR_W,
        flexShrink: 0,
        background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 12px',
        overflow: 'hidden',
      };

  const email = session.user.email ?? '—';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.seasalt }}>
      {/* Drawer backdrop — only renders on compact viewports while open */}
      {isCompact && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.36)', zIndex: 99 }}
        />
      )}

      <aside style={sidebarStyle}>
        <div
          style={{
            padding: '20px 8px 16px',
            borderBottom: `1px solid ${C.divider}`,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 54,
          }}
        >
          <VoltaraLogo height={34} />
        </div>

        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            paddingBottom: 12,
          }}
        >
          {NAV_SECTIONS.map((section, i) => {
            const isCollapsed = section.label ? collapsed.has(section.label) : false;
            return (
              <div
                key={section.label ?? `top-${i}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                {section.label && (
                  <button
                    onClick={() => toggleSection(section.label!)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'Figtree',
                      fontSize: 10,
                      fontWeight: 700,
                      color: C.slate,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: i === 0 ? '10px 16px 4px' : '14px 16px 4px',
                    }}
                  >
                    <span>{section.label}</span>
                    <span
                      style={{
                        fontSize: 9,
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 120ms',
                        display: 'inline-block',
                      }}
                    >
                      ▾
                    </span>
                  </button>
                )}
                {!isCollapsed &&
                  section.items.map((n) => (
                    <NavItem
                      key={n.path}
                      icon={n.icon}
                      label={n.label}
                      active={pathname === n.path || pathname.startsWith(`${n.path}/`)}
                      onClick={() => {
                        navigate(n.path);
                        // Auto-dismiss the drawer on tablet/phone so the user
                        // doesn't have to tap the backdrop separately.
                        if (isCompact) setDrawerOpen(false);
                      }}
                    />
                  ))}
              </div>
            );
          })}
        </nav>

        <div
          style={{
            borderTop: `1px solid ${C.divider}`,
            padding: '14px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: C.green,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.yellow,
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {email[0]?.toUpperCase() ?? 'V'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={email}
            >
              {email}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.slate,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {tenant?.name ?? '…'}
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign out"
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: C.slate,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.green)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.slate)}
          >
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <header
          data-voltara-header
          style={{
            height: 60,
            flexShrink: 0,
            background: C.white,
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 28px',
            gap: 16,
          }}
        >
          {isCompact && (
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: drawerOpen ? C.honeydew : C.white,
                color: C.green,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {/* Three-bar hamburger via SVG so it scales crisply */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="2" y1="4" x2="16" y2="4" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="14" x2="16" y2="14" />
              </svg>
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: C.green,
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {titleFor(pathname)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.slate,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {today} · Kuala Lumpur
            </div>
          </div>
        </header>

        <div data-voltara-main style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/charge-points" replace />} />
            {ROUTES.map((r) => (
              <Route key={r.path} path={`${r.path}/*`} element={<r.screen />} />
            ))}
            <Route
              path="*"
              element={
                <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
                  Page not found.
                </div>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}
