import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRoadmap, RoadmapConflict, saveRoadmap } from './api';
import type { RoadmapDoc, RoadmapItem } from './types';

export const KEY = ['roadmap'] as const;

export function useRoadmap() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchRoadmap,
    // Picks up edits made on another machine or by a git pull.
    refetchInterval: 30_000,
  });
}

/** Saves the whole list. The board updates at once; a failed save rolls it back. */
export function useSaveRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    // Quick successive edits save one after another, each on top of the last.
    scope: { id: 'roadmap' },
    mutationFn: (items: RoadmapItem[]) =>
      saveRoadmap(qc.getQueryData<RoadmapDoc>(KEY)?.updatedAt ?? '', items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<RoadmapDoc>(KEY);
      if (previous) qc.setQueryData<RoadmapDoc>(KEY, { ...previous, items });
      return { previous };
    },
    // Keep the items on screen (a later edit may already be showing); only
    // take the new revision stamp.
    onSuccess: (doc) =>
      qc.setQueryData<RoadmapDoc>(KEY, (old) => (old ? { ...old, updatedAt: doc.updatedAt } : doc)),
    onError: (err, _items, ctx) => {
      if (err instanceof RoadmapConflict) qc.setQueryData(KEY, err.current);
      else if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
  });
}
