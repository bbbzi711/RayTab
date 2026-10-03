import { openDB, type DBSchema } from 'idb';
import type { RayState } from './model';
import type { EncryptedEnvelope } from '@/security/crypto';

export type WallpaperCache = { source: string; color: string; blob?: Blob; fetchedAt: number };
export interface RayDatabase extends DBSchema {
  state: { key: string; value: RayState };
  resources: { key: string; value: Blob };
  vault: { key: string; value: EncryptedEnvelope };
  wallpapers: { key: string; value: WallpaperCache };
}

export const RAY_DATABASE_NAME = 'raytab-v11';

export function openRayDatabase(name = RAY_DATABASE_NAME) {
  return openDB<RayDatabase>(name, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('resources')) db.createObjectStore('resources');
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
      if (!db.objectStoreNames.contains('wallpapers')) db.createObjectStore('wallpapers');
    },
  });
}
