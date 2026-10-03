import { useEffect, useState } from 'react';
import { repository } from '@/storage/repository';
import { useRayTabStore } from '@/storage/store';

export function useResourceUrl(id?: string) {
  const resourceVersion = useRayTabStore((store) => store.resourceVersion);
  const [resource, setResource] = useState<{ id: string; version: number; url: string }>();
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    if (id)
      void repository
        .resource(id)
        .then((blob) => {
          if (blob && !cancelled) {
            url = URL.createObjectURL(blob);
            setResource({ id, version: resourceVersion, url });
          }
        })
        .catch(() => {
          /* The desktop still displays a letter or preset background. */
        });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, resourceVersion]);
  return resource && resource.id === id && resource.version === resourceVersion
    ? resource.url
    : undefined;
}
