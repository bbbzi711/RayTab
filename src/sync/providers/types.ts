export type RemoteFile = { content: string; version: string | null };
export class SyncProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'not-found' | 'conflict' | 'network' | 'invalid',
  ) {
    super(message);
  }
}
export interface SyncProvider {
  read(): Promise<RemoteFile | null>;
  write(content: string, expectedVersion: string | null): Promise<string | null>;
}
export type WebDavConfig = { type: 'webdav'; url: string; username: string; password: string };
export type GitHubConfig = {
  type: 'github';
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch?: string;
};
export type GiteeConfig = {
  type: 'gitee';
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch?: string;
};
export type SyncConnection = WebDavConfig | GitHubConfig | GiteeConfig;
