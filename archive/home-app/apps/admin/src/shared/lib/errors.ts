/** A message for the UI from whatever a query or mutation threw. */
export function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(err);
}

/**
 * Edge functions answer 4xx with a JSON body explaining why; surface that
 * rather than supabase-js's generic "non-2xx status code".
 */
export async function functionErrorMessage(err: unknown): Promise<string> {
  const ctx = (err as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) return body.error;
  }
  return errorMessage(err) ?? 'Request failed.';
}
