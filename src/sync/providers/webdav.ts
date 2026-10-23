import { request } from './http';
import { SyncProviderError, type SyncProvider, type WebDavConfig } from './types';

export function resolveWebDavFileUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SyncProviderError('errors.sync.webdavUrlRequired', 'invalid');
  }
  const nutstore = url.hostname === 'dav.jianguoyun.com';
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (nutstore && url.pathname !== '/dav' && !url.pathname.startsWith('/dav/'))
  )
    throw new SyncProviderError('errors.sync.webdavUrlRequired', 'invalid');
  // Server URLs address a collection; GET/PUT must target its backup file.
  // Preserve explicit file URLs, including existing extensionless targets.
  if (nutstore && url.pathname === '/dav') url.pathname += '/';
  if (url.pathname.endsWith('/')) url.pathname += 'raytab.json';
  url.hash = '';
  return url.href;
}

export function createWebDavProvider(config: WebDavConfig): SyncProvider {
  const fileUrl = resolveWebDavFileUrl(config.url);
  const authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  return {
    async read() {
      try {
        const response = await request(fileUrl, {
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
      const response = await request(fileUrl, { method: 'PUT', headers, body: content });
      return response.headers.get('etag');
    },
  };
}
