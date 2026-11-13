// The product roadmap board (Dev → Roadmap). Stored as one JSON file in the
// repo — docs/product-roadmap.json — not in the database.

/** Now / Next / Later: the common SaaS roadmap horizons, plus what shipped. */
export const ROADMAP_STATUSES = ['now', 'next', 'later', 'done'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const STATUS_META: Record<RoadmapStatus, { label: string; hint: string }> = {
  now: { label: 'Now', hint: 'Being worked on' },
  next: { label: 'Next', hint: 'Up after that' },
  later: { label: 'Later', hint: 'Planned, not scheduled' },
  done: { label: 'Done', hint: 'Shipped' },
};

export const ROADMAP_AREAS = [
  'Chargers',
  'Sessions & logs',
  'Gateway & OCPP',
  'Smart charging',
  'Billing',
  'Payments',
  'Driver app',
  'Home app',
  'White-label',
  'Compliance',
  'Platform',
] as const;
export type RoadmapArea = (typeof ROADMAP_AREAS)[number];

export const ROADMAP_PRIORITIES = ['high', 'medium', 'low'] as const;
export type RoadmapPriority = (typeof ROADMAP_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<RoadmapPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface RoadmapItem {
  id: string;
  title: string;
  /** What it is and why, in a sentence or two; may be empty. */
  notes: string;
  area: RoadmapArea;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  /** ISO date (YYYY-MM-DD) it moved to Done. */
  doneAt: string | null;
}

export interface RoadmapDoc {
  version: 1;
  updatedAt: string;
  items: RoadmapItem[];
}
