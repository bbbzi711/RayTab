import { request } from './http';
import { SyncProviderError, type SyncProvider, type WebDavConfig } from './types';

function resolveWebDavTarget(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SyncProviderError('errors.sync.webdavUrlRequired', 'invalid');
  }
  const nutstore = url.hostname === 'dav.jianguoyun.com';
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (nutstore && url.pathname !== '/dav' && !url.pathname.startsWith('/dav/'))
  )
    throw new SyncProviderError('errors.sync.webdavUrlRequired', 'invalid');
  url.hash = '';
  // Nutstore lists folders at the account root but rejects file uploads there.
  const usesNutstoreRoot = nutstore && (url.pathname === '/dav' || url.pathname === '/dav/');
  if (usesNutstoreRoot) url.pathname = '/dav/RayTab/';
  const directoryUrl = usesNutstoreRoot ? url.href : undefined;
  if (url.pathname.endsWith('/')) url.pathname += 'raytab.json';
  return { fileUrl: url.href, directoryUrl };
}

export function resolveWebDavFileUrl(value: string) {
  return resolveWebDavTarget(value).fileUrl;
}

export function createWebDavProvider(config: WebDavConfig): SyncProvider {
  const { fileUrl, directoryUrl } = resolveWebDavTarget(config.url);
  const authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  const read: SyncProvider['read'] = async () => {
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
  };

  return {
    read,
    async write(content, expectedVersion) {
      if (directoryUrl && expectedVersion === null) {
        const folder = await request(directoryUrl, {
          method: 'MKCOL',
          headers: { Authorization: authorization },
        });
        // Another device can create the directory and backup after our first read.
        if (folder.status === 405 && (await read()))
          throw new SyncProviderError(
            'messages.theRemoteContentWasUpdatedByAnotherDevice',
            'conflict',
          );
      }
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
