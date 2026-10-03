import {
  decodeBase64,
  encodeBase64,
  request,
  parseResponseJson,
  gitFileResponseSchema,
  gitWriteResponseSchema,
} from './http';
import { SyncProviderError, type GitHubConfig, type SyncProvider } from './types';

export function createGitHubProvider(config: GitHubConfig): SyncProvider {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token}`,
    'X-GitHub-Api-Version': '2026-03-10',
  };
  return {
    async read() {
      try {
        const response = await request(withBranch(endpoint, config.branch), {
          headers,
          cache: 'no-store',
        });
        const data = await parseResponseJson(response, gitFileResponseSchema);
        if (data.type !== 'file')
          throw new SyncProviderError('messages.theGithubPathIsNotAFile', 'invalid');
        return { content: decodeBase64(data.content), version: data.sha };
      } catch (error) {
        if (error instanceof SyncProviderError && error.code === 'not-found') return null;
        throw error;
      }
    },
    async write(content, expectedVersion) {
      const body: Record<string, string> = {
        message: 'Update RayTab sync data',
        content: encodeBase64(content),
      };
      if (expectedVersion) body.sha = expectedVersion;
      if (config.branch) body.branch = config.branch;
      const response = await request(endpoint, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await parseResponseJson(response, gitWriteResponseSchema);
      return data.content.sha;
    },
  };
}
function withBranch(url: string, branch?: string) {
  return branch ? `${url}?ref=${encodeURIComponent(branch)}` : url;
}
