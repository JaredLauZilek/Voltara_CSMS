import { useQuery } from '@tanstack/react-query';
import { fetchPhoneLink, fetchServiceStatus } from './api';

export const KEY = ['dev-tools'] as const;

export function usePhoneLink() {
  return useQuery({
    queryKey: [...KEY, 'phone'],
    queryFn: fetchPhoneLink,
    refetchInterval: 15_000,
  });
}

export function useServiceStatus() {
  return useQuery({
    queryKey: [...KEY, 'services'],
    queryFn: fetchServiceStatus,
    refetchInterval: 10_000,
    placeholderData: { supabase: 'checking', gateway: 'checking', expo: 'checking' },
  });
}
