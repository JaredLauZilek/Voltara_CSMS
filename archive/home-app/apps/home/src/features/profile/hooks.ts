import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import * as api from './api';

export function useMyProfile() {
  const { session } = useAuth();
  const id = session?.user.id ?? null;
  return useQuery({
    queryKey: ['profile', id],
    queryFn: () => api.getMyProfile(id!),
    enabled: !!id,
  });
}

export function useUpdateProfile() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateMyProfile>[1]) =>
      api.updateMyProfile(session!.user.id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

/** Staff / dealer / owner — decides whether the installer tab shows. */
export function useActor() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['actor', session?.user.id ?? null],
    queryFn: api.getActor,
    enabled: !!session,
    staleTime: 300_000,
  });
}
