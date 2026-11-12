// @voltara/ui — the Voltara design system, ported from the accounting dashboard.
// Tokens + components only. This package must never import supabase or any
// data layer; data-touching behaviour is injected via props (see AttachmentsField).

export { C, RADIUS, SPACE, STATUS_COLORS } from './tokens';
export type { Attachment } from './types';

export { Badge, StatusPill } from './components/Badge';
export { KPICard } from './components/KPICard';
export { Modal } from './components/Modal';
export { NavItem } from './components/NavItem';
export { Pagination, usePagination, DEFAULT_PAGE_SIZE } from './components/Pagination';
export { SearchableSelect } from './components/SearchableSelect';
export type { SelectOption } from './components/SearchableSelect';
export { ShareModal } from './components/ShareModal';
export type { ShareMethod } from './components/ShareModal';
export { Toolbar } from './components/Toolbar';
export { VoltaraLogo } from './components/VoltaraLogo';
export { AttachmentsField } from './components/AttachmentsField';
export type { AttachmentStorage } from './components/AttachmentsField';

export { Sparkline } from './components/charts/Sparkline';
export { MiniBar } from './components/charts/MiniBar';
export { Donut } from './components/charts/Donut';
export { LineChart } from './components/charts/LineChart';
export { BarChart } from './components/charts/BarChart';

export { useViewport, BP_MOBILE, BP_TABLET } from './hooks/useViewport';
