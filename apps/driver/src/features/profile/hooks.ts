import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import * as api from './api';
import type { DriverProfile } from './api';

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api.getProfile(userId!),
    enabled: Boolean(userId),
  });
}

export function useSaveProfile() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<
        Pick<DriverProfile, 'display_name' | 'phone' | 'vehicle_plate' | 'vehicle_model'>
      >,
    ) => api.saveProfile(session!.user.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useMyTags() {
  return useQuery({ queryKey: ['profile', 'tags'], queryFn: api.listMyTags });
}
