import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from '../src/sync/providers/github';
import { createGiteeProvider } from '../src/sync/providers/gitee';
import { createWebDavProvider } from '../src/sync/providers/webdav';

afterEach(() => vi.unstubAllGlobals());

describe('sync provider concurrency guards', () => {
  it('reports rejected credentials and concurrent writes with actionable errors', async () => {
    const provider = createWebDavProvider({
      type: 'webdav',
      url: 'https://dav.test/raytab.json',
      username: 'u',
      password: 'p',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(provider.read()).rejects.toThrow('认证失败，请检查账号或令牌权限');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 412 })));
    await expect(provider.write('{}', 'stale')).rejects.toThrow('远端内容已被其他设备更新');
  });

  it('uses WebDAV ETags for conditional writes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200, headers: { etag: 'next' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createWebDavProvider({
      type: 'webdav',
      url: 'https://dav.test/raytab.json',
      username: 'u',
      password: 'p',
    });
    await expect(provider.write('{}', 'previous')).resolves.toBe('next');
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBe('previous');
  });

  it('sends the current GitHub file SHA when updating', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ content: { sha: 'next' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGitHubProvider({
      type: 'github',
      owner: 'ray',
      repo: 'tab',
      path: 'data.json',
      token: 'secret',
    });
    await provider.write('你好', 'previous');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ sha: 'previous' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
  });

  it('uses the Gitee update method and SHA for an existing file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ content: { sha: 'next' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGiteeProvider({
      type: 'gitee',
      owner: 'ray',
      repo: 'tab',
      path: 'data.json',
      token: 'secret',
    });
    await provider.write('{}', 'previous');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect((init.body as URLSearchParams).get('sha')).toBe('previous');
  });
});
