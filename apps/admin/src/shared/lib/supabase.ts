import { createClient } from '@supabase/supabase-js';
import type { Database } from '@voltara/shared/database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — copy apps/admin/.env.example to .env.local. Using a dead placeholder so the app still boots.',
  );
}

export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'anon');
