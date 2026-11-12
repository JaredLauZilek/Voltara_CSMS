// Cross-feature value types (not row types — those live in each feature's types.ts).

// Generic file attachment stored in Supabase Storage.
export interface Attachment {
  name: string;
  mime: string;
  storage_path: string; // path inside the storage bucket
  size: number;
  uploaded_at: string;
}
