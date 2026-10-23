import { useEffect, useState } from 'react';
import { repository } from '@/storage/repository';
import { selectResourceVersion, useRayTabStore } from '@/storage/store';

type ResourceEntry = { url?: string; listeners: Set<() => void> };
const resources = new Map<string, ResourceEntry>();

// A private-session boundary must also discard URLs held by pending or shared consumers.
useRayTabStore.subscribe((current, previous) => {
  if (current.resourceVersion === previous.resourceVersion) return;
  const entries = [...resources.values()];
  resources.clear();
  for (const entry of entries) {
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = undefined;
    for (const notify of entry.listeners) notify();
  }
});

export function useResourceUrl(id?: string) {
  const version = useRayTabStore((store) => selectResourceVersion(store, id));
  const [resource, setResource] = useState<
    { id: string; version: string; url: string } | undefined
  >(() => {
    if (!id) return;
    const url = resources.get(`${version}/${id}`)?.url;
    return url ? { id, version, url } : undefined;
  });
  useEffect(() => {
    if (!id) return;
    const key = `${version}/${id}`;
    let entry = resources.get(key);
    if (!entry) {
      const pending: ResourceEntry = { listeners: new Set() };
      entry = pending;
      resources.set(key, pending);
      void repository
        .resource(id)
        .then((blob) => {
          if (!blob || resources.get(key) !== pending) return;
          pending.url = URL.createObjectURL(blob);
          for (const notify of pending.listeners) notify();
        })
        .catch(() => {
          /* The desktop still displays a letter or preset background. */
        });
    }
    const current = entry;
    const notify = () => setResource(current.url ? { id, version, url: current.url } : undefined);
    current.listeners.add(notify);
    notify();
    return () => {
      current.listeners.delete(notify);
      // Retain a URL through a same-commit remount, including StrictMode's effect replay.
      queueMicrotask(() => {
        if (current.listeners.size || resources.get(key) !== current) return;
        resources.delete(key);
        if (current.url) URL.revokeObjectURL(current.url);
      });
    };
  }, [id, version]);
  return resource && resource.id === id && resource.version === version ? resource.url : undefined;
}
