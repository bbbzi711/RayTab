import { request } from './http';
import { SyncProviderError, type SyncProvider, type WebDavConfig } from './types';

export function createWebDavProvider(config: WebDavConfig): SyncProvider {
  const authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  return {
    async read() {
      try {
        const response = await request(config.url, {
          headers: { Authorization: authorization, Accept: 'application/json' },
          cache: 'no-store',
        });
        return { content: await response.text(), version: response.headers.get('etag') };
      } catch (error) {
        if (error instanceof SyncProviderError && error.code === 'not-found') return null;
        throw error;
      }
    },
    async write(content, expectedVersion) {
      const headers: Record<string, string> = {
        Authorization: authorization,
        'Content-Type': 'application/json',
      };
      if (expectedVersion) headers['If-Match'] = expectedVersion;
      else headers['If-None-Match'] = '*';
      const response = await request(config.url, { method: 'PUT', headers, body: content });
      return response.headers.get('etag');
    },
  };
}
