import { useQuery } from '@tanstack/react-query';
import * as api from './api';
import { groupOwners } from './types';

const KEY = ['owners'] as const;

export function useOwners() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listOwnerChargers,
    select: (rows) => groupOwners(rows),
    refetchInterval: 60_000,
  });
}
