import { useRef, useState } from 'react';
import { C } from '../tokens';
import type { Attachment } from '../types';

// Storage backend injected by the host app — @voltara/ui must stay free of
// supabase (or any data-layer) imports so the driver app can reuse it too.
export interface AttachmentStorage {
  upload: (path: string, blob: Blob, contentType: string) => Promise<void>; // throw on failure
  getUrl: (path: string) => string;
  remove: (path: string) => Promise<void>;
}

interface Props {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  storagePath: string; // folder prefix within the bucket, e.g. "charge-points/CP-123456"
  storage: AttachmentStorage;
  maxFiles?: number;
  label?: string;
}

const MAX_BYTES = 2_000_000;
const MAX_IMAGE_DIM = 1600;
const ACCEPTED = 'image/png,image/jpeg,application/pdf';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function resizeToBlob(file: File, max: number): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rej(new Error('Canvas unavailable.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas toBlob failed.'))), 'image/png');
    };
    img.onerror = () => rej(new Error('Could not load image.'));
    img.src = URL.createObjectURL(file);
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function AttachmentsField({
  value,
  onChange,
  storagePath,
  storage,
  maxFiles = 5,
  label = 'attachment',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files);
    if (value.length + list.length > maxFiles) {
      setError(`Maximum ${maxFiles} ${label}s.`);
      return;
    }
    setUploading(true);
    const next: Attachment[] = [...value];
    for (const file of list) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" exceeds 2 MB.`);
        setUploading(false);
        return;
      }
      try {
        const blob = file.type.startsWith('image/')
          ? await resizeToBlob(file, MAX_IMAGE_DIM)
          : file;
        const ext = file.type === 'application/pdf' ? 'pdf' : 'png';
        const path = `${storagePath}/${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;
        await storage.upload(path, blob, blob.type);
        next.push({
          name: file.name,
          mime: file.type,
          storage_path: path,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      } catch (e) {
        setError((e as Error).message);
        setUploading(false);
        return;
      }
    }
    onChange(next);
    setUploading(false);
  };

  const openFile = (att: Attachment) => {
    window.open(storage.getUrl(att.storage_path), '_blank');
  };

  const remove = async (i: number) => {
    const att = value[i];
    await storage.remove(att.storage_path);
    onChange(value.filter((_, idx) => idx !== i));
    setConfirmIdx(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${isDragging ? C.green : C.border}`,
          borderRadius: 10,
          padding: '14px 16px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: isDragging ? C.honeydew : C.seasalt,
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <div style={{ fontSize: 13, color: C.slate }}>
          {uploading ? (
            'Uploading…'
          ) : (
            <>
              Drag & drop or <span style={{ color: C.green, fontWeight: 700 }}>browse</span>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
          PNG, JPG, PDF · max 2 MB · up to {maxFiles} files
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <div style={{ fontSize: 12, color: '#C0321A', fontWeight: 600 }}>{error}</div>}
      {value.map((att, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.white,
          }}
        >
          <span style={{ fontSize: 16 }}>{att.mime === 'application/pdf' ? '📄' : '🖼️'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {att.name}
            </div>
            <div style={{ fontSize: 11, color: C.slate }}>{formatBytes(att.size)}</div>
          </div>
          <button
            type="button"
            onClick={() => openFile(att)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.green,
              background: C.honeydew,
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              fontFamily: 'Figtree',
              flexShrink: 0,
            }}
          >
            View
          </button>
          {confirmIdx === i ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span
                style={{ fontSize: 11, color: '#C0321A', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                Remove file?
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.white,
                  background: '#C0321A',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: 'Figtree',
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmIdx(null)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.slate,
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: 'Figtree',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmIdx(i)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#C0321A',
                background: 'transparent',
                border: `1px solid #FDEAEA`,
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'Figtree',
                flexShrink: 0,
              }}
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
