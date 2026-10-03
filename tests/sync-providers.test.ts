import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from '../src/sync/providers/github';
import { createGiteeProvider } from '../src/sync/providers/gitee';
import { createWebDavProvider } from '../src/sync/providers/webdav';
import { serializeError } from '../src/lib/errors';

afterEach(() => vi.unstubAllGlobals());

describe('sync provider concurrency guards', () => {
  it.each(['github', 'gitee'] as const)(
    'classifies invalid %s JSON without exposing a token from the body',
    async (type) => {
      const config = {
        type,
        owner: 'ray',
        repo: 'tab',
        path: 'data.json',
        token: 'sensitive-fixture-token',
      };
      const provider =
        type === 'github'
          ? createGitHubProvider({ ...config, type })
          : createGiteeProvider({ ...config, type });
      for (const operation of [() => provider.read(), () => provider.write('{}', 'previous')]) {
        vi.stubGlobal(
          'fetch',
          vi
            .fn()
            .mockResolvedValue(
              new Response('sensitive-fixture-token is not valid JSON', { status: 200 }),
            ),
        );
        try {
          await operation();
          throw new Error('Expected invalid response');
        } catch (error) {
          expect(error).toMatchObject({
            code: 'invalid',
            translationKey: 'errors.sync.invalidRemoteResponse',
          });
          expect(JSON.stringify(serializeError(error))).not.toContain(config.token);
          expect(String(error)).not.toContain('sensitive-fixture');
        }
      }
    },
  );
  it.each(['github', 'gitee'] as const)(
    'rejects an invalid %s response shape and a successful write without its version token',
    async (type) => {
      const config = { type, owner: 'ray', repo: 'tab', path: 'data.json', token: 'fixture-token' };
      const provider =
        type === 'github'
          ? createGitHubProvider({ ...config, type })
          : createGiteeProvider({ ...config, type });
      for (const body of [
        null,
        { type: 'file', content: 'e30=', sha: '' },
        { message: config.token },
      ]) {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
        await expect(provider.read()).rejects.toMatchObject({
          code: 'invalid',
          translationKey: 'errors.sync.invalidRemoteResponse',
        });
      }
      for (const body of [{}, { content: { sha: '' } }, { content: null }]) {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
        await expect(provider.write('{}', 'previous')).rejects.toMatchObject({
          code: 'invalid',
          translationKey: 'errors.sync.invalidRemoteResponse',
        });
      }
    },
  );
  it('reports rejected credentials and concurrent writes with actionable errors', async () => {
    const provider = createWebDavProvider({
      type: 'webdav',
      url: 'https://dav.test/raytab.json',
      username: 'u',
      password: 'p',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(provider.read()).rejects.toMatchObject({
      code: 'auth',
      translationKey: 'messages.authenticationFailedCheckTheAccountOrTokenPermissions',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 412 })));
    await expect(provider.write('{}', 'stale')).rejects.toMatchObject({
      code: 'conflict',
      translationKey: 'messages.theRemoteContentWasUpdatedByAnotherDevice',
    });
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
