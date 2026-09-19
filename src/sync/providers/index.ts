import { createGiteeProvider } from './gitee';
import { createGitHubProvider } from './github';
import type { SyncConnection } from './types';
import { createWebDavProvider } from './webdav';

export function createProvider(config: SyncConnection) {
  if (config.type === 'webdav') return createWebDavProvider(config);
  if (config.type === 'github') return createGitHubProvider(config);
  return createGiteeProvider(config);
}
export type { SyncConnection, SyncProvider, RemoteFile } from './types';
