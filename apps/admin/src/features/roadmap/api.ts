// Dev-only: the roadmap file is read and written through the dev server
// (vite.roadmap.ts). No supabase here.
import type { RoadmapDoc, RoadmapItem } from './types';

const ROUTE = '/__dev/roadmap';

export async function fetchRoadmap(): Promise<RoadmapDoc> {
  const res = await fetch(ROUTE);
  if (!res.ok) throw new Error('Could not load the roadmap file.');
  return (await res.json()) as RoadmapDoc;
}

/** Thrown when the file changed since it was loaded; carries the current copy. */
export class RoadmapConflict extends Error {
  constructor(public current: RoadmapDoc) {
    super('The roadmap was changed somewhere else. It has been reloaded — make the change again.');
  }
}

export async function saveRoadmap(base: string, items: RoadmapItem[]): Promise<RoadmapDoc> {
  const res = await fetch(ROUTE, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base, items }),
  });
  if (res.status === 409) throw new RoadmapConflict((await res.json()) as RoadmapDoc);
  if (!res.ok) throw new Error('Could not save the roadmap file.');
  return (await res.json()) as RoadmapDoc;
}
