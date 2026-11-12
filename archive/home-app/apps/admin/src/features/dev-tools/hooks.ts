import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export function usePhoneLink() {
  return useQuery({
    queryKey: ['dev', 'phone-link'],
    queryFn: api.readPhoneLink,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

export function useServiceStatus() {
  return useQuery({
    queryKey: ['dev', 'services'],
    queryFn: api.readServiceStatus,
    refetchInterval: 10_000,
    staleTime: 0,
  });
}
