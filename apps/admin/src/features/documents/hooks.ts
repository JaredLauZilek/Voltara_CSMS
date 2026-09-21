import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['documents'] as const;

export function useDocuments() {
  return useQuery({ queryKey: KEY, queryFn: api.listDocuments });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: ['documents', 'detail', id], queryFn: () => api.getDocument(id) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['cdrs'] });
  };
}

/** One invoice per account; "all" walks every account and skips those with nothing to bill. */
export function useRunInvoices() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      accountIds,
      from,
      to,
    }: {
      accountIds: string[];
      from: string;
      to: string;
    }) => {
      const created: string[] = [];
      const skipped: string[] = [];
      for (const id of accountIds) {
        try {
          created.push(await api.runInvoice(id, from, to));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/No uninvoiced sessions/i.test(msg)) skipped.push(id);
          else throw err;
        }
      }
      return { created, skipped };
    },
    onSuccess: invalidate,
  });
}

export function useRunSettlement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ locationId, from, to }: { locationId: string; from: string; to: string }) =>
      api.runSettlement(locationId, from, to),
    onSuccess: invalidate,
  });
}

export function useIssueDocument() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.issueDocument(id), onSuccess: invalidate });
}

export function useVoidDocument() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.voidDocument(id), onSuccess: invalidate });
}
