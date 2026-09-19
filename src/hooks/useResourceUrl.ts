import { useEffect, useState } from 'react';
import { repository } from '@/storage/store';

export function useResourceUrl(id?: string) {
  const [resource, setResource] = useState<{ id: string; url: string }>();
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    if (id)
      void repository
        .resource(id)
        .then((blob) => {
          if (blob && !cancelled) {
            url = URL.createObjectURL(blob);
            setResource({ id, url });
          }
        })
        .catch(() => {
          /* The desktop still displays a letter or preset background. */
        });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return resource && resource.id === id ? resource.url : undefined;
}
