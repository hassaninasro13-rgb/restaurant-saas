import { supabase } from './client.js';

/** Public asset buckets — create in Supabase Dashboard → Storage with public read as needed */
export const STORAGE_BUCKETS = {
  products: 'products',
  logos: 'logos',
  covers: 'covers',
};

function extFromFile(file) {
  const raw = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8);
  return raw || 'jpg';
}

/**
 * Upload a file and return its public URL (bucket must allow public access for the URL to work for guests).
 * @returns {{ publicUrl: string | null, path: string | null, error: Error | null }}
 */
export async function uploadToPublicBucket(bucket, path, file, options = {}) {
  const { upsert = true } = options;
  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, file, { upsert });
  if (uploadErr) return { publicUrl: null, path: null, error: uploadErr };
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl, path, error: null };
}

/** Product image: `{restaurantId}/{timestamp}-{rand}.{ext}` */
export async function uploadProductImageToStorage(restaurantId, file) {
  const ext = extFromFile(file);
  const path = `${restaurantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return uploadToPublicBucket(STORAGE_BUCKETS.products, path, file, { upsert: true });
}

/** Owner logo: one file per user folder, replace on re-upload */
export async function uploadLogoToStorage(userId, file) {
  const ext = extFromFile(file);
  const path = `${userId}/logo.${ext}`;
  return uploadToPublicBucket(STORAGE_BUCKETS.logos, path, file, { upsert: true });
}

/** Restaurant cover / bannière menu: unique path per upload */
export async function uploadCoverToStorage(userId, file) {
  const ext = extFromFile(file);
  const path = `${userId}/cover-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  return uploadToPublicBucket(STORAGE_BUCKETS.covers, path, file, { upsert: false });
}
