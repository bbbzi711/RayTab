import { decodeBase64, encodeBase64, request } from './http';
import { SyncProviderError, type GiteeConfig, type SyncProvider } from './types';

export function createGiteeProvider(config: GiteeConfig): SyncProvider {
  const endpoint = `https://gitee.com/api/v5/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}`;
  return {
    async read() {
      try {
        const params = new URLSearchParams({ access_token: config.token });
        if (config.branch) params.set('ref', config.branch);
        const response = await request(`${endpoint}?${params}`, { cache: 'no-store' });
        const data = (await response.json()) as { type: string; content: string; sha: string };
        if (data.type !== 'file') throw new SyncProviderError('Gitee 路径不是文件', 'invalid');
        return { content: decodeBase64(data.content), version: data.sha };
      } catch (error) {
        if (error instanceof SyncProviderError && error.code === 'not-found') return null;
        throw error;
      }
    },
    async write(content, expectedVersion) {
      const body = new URLSearchParams({
        access_token: config.token,
        content: encodeBase64(content),
        message: 'Update RayTab sync data',
      });
      if (expectedVersion) body.set('sha', expectedVersion);
      if (config.branch) body.set('branch', config.branch);
      const response = await request(endpoint, {
        method: expectedVersion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = (await response.json()) as { content?: { sha?: string } };
      return data.content?.sha ?? null;
    },
  };
}
