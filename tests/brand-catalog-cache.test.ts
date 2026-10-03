import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'raytab-public-brand-catalog';
const entry = {
  title: 'New Product',
  url: 'https://newproduct.com/tools',
  route: 'https://svgl.app/library/new-product.svg',
};
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.resetModules();
  stored = {};
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(async () => structuredClone(stored)),
        set: vi.fn(async (values: Record<string, unknown>) => Object.assign(stored, values)),
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('public brand catalog cache', () => {
  it('fetches a shared index once, matches exact product paths locally, and never uploads user URLs', async () => {
    const fetch = vi.fn(async (_url: string) =>
      Response.json([
        { ...entry, title: 'Parent', url: 'https://newproduct.com/' },
        entry,
        { ...entry, title: 'Child', url: 'https://newproduct.com/tools/editor' },
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const { findPublicCatalogIcon } = await import('../src/features/navigation/brand-catalog');
    expect(
      (await findPublicCatalogIcon('https://newproduct.com/tools/editor?token=secret'))?.title,
    ).toBe('Child');
    expect((await findPublicCatalogIcon('https://newproduct.com/tools/document'))?.title).toBe(
      'New Product',
    );
    expect((await findPublicCatalogIcon('https://newproduct.com/tools-other'))?.title).toBe(
      'Parent',
    );
    expect(await findPublicCatalogIcon('https://newproduct.com.evil.com/tools')).toBeUndefined();
    expect(await findPublicCatalogIcon('https://sub.newproduct.com/tools')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.svgl.app');
    expect(JSON.stringify(stored)).not.toMatch(/token|secret|document|evil\.com/);
  });

  it('keeps the public index across page reloads and updates it only after seven days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
    const fetch = vi.fn(async () => Response.json([entry]));
    vi.stubGlobal('fetch', fetch);
    let catalog = await import('../src/features/navigation/brand-catalog');
    await catalog.findPublicCatalogIcon('https://newproduct.com/tools');
    vi.resetModules();
    catalog = await import('../src/features/navigation/brand-catalog');
    await catalog.findPublicCatalogIcon('https://newproduct.com/tools');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    await catalog.findPublicCatalogIcon('https://newproduct.com/tools');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses product paths only on their actual domain rather than borrowing paths from an app alias', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { ...entry, title: 'OpenAI', url: 'https://openai.com/' },
          { ...entry, title: 'Codex', url: 'https://openai.com/codex' },
        ]),
      ),
    );
    const { findPublicCatalogIcon } = await import('../src/features/navigation/brand-catalog');
    expect((await findPublicCatalogIcon('https://openai.com/codex/docs'))?.title).toBe('Codex');
    expect((await findPublicCatalogIcon('https://chatgpt.com/codex'))?.title).toBe('OpenAI');
    expect(await findPublicCatalogIcon('https://mail.openai.com/codex')).toBeUndefined();
  });

  it('retains a stale index when refresh fails and bounds retries across page reloads', async () => {
    stored[key] = { entries: [entry], fetchedAt: Date.now() - 8 * 86_400_000, attemptedAt: 0 };
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    let catalog = await import('../src/features/navigation/brand-catalog');
    expect((await catalog.findPublicCatalogIcon('https://newproduct.com/tools'))?.title).toBe(
      'New Product',
    );
    vi.resetModules();
    catalog = await import('../src/features/navigation/brand-catalog');
    await catalog.findPublicCatalogIcon('https://newproduct.com/tools');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects arbitrary asset hosts and invalid data without losing the last valid catalog', async () => {
    stored[key] = { entries: [entry], fetchedAt: Date.now() - 8 * 86_400_000, attemptedAt: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ invalid: true })),
    );
    const { findPublicCatalogIcon } = await import('../src/features/navigation/brand-catalog');
    expect((await findPublicCatalogIcon('https://newproduct.com/tools'))?.title).toBe(
      'New Product',
    );
    vi.resetModules();
    stored = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { ...entry, route: 'https://evil.com/new-product.svg' },
          { ...entry, route: 'https://svgl.app/library/new-product.svg?token=secret' },
        ]),
      ),
    );
    const clean = await import('../src/features/navigation/brand-catalog');
    expect(await clean.findPublicCatalogIcon('https://newproduct.com/tools')).toBeUndefined();
  });

  it('reports cache write failure while still allowing discovery in this page', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {
            throw new Error('quota');
          }),
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([entry])),
    );
    const { findPublicCatalogIcon } = await import('../src/features/navigation/brand-catalog');
    expect((await findPublicCatalogIcon('https://newproduct.com/tools'))?.title).toBe(
      'New Product',
    );
    expect(stored).toEqual({});
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Unable to persist'));
  });
});

describe('explicit website icon resolution', () => {
  it('downloads a newly cataloged brand without adding it to the bundled index', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32z"/></svg>';
    const fetch = vi.fn(async (url: string) =>
      url === 'https://api.svgl.app'
        ? Response.json([entry])
        : new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }),
    );
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 32, height: 32, close() {} })),
    );
    const { resolveWebsiteIcon } = await import('../src/features/navigation/site-metadata');
    const result = await resolveWebsiteIcon('https://newproduct.com/tools?token=secret');
    expect(result.localBrand).toBe(false);
    expect(result.title).toBe('New Product');
    expect(result.background).toBe('#ffffff');
    expect(await result.icon?.text()).toBe(svg);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.svgl.app',
      'https://svgl.app/library/new-product.svg',
    ]);
  });

  it('keeps local curated icons usable offline and makes no public request in private space', async () => {
    const fetch = vi.fn(async (_url: string) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const { resolveWebsiteIcon } = await import('../src/features/navigation/site-metadata');
    expect(
      (await resolveWebsiteIcon('https://tieba.baidu.com', { allowPublicService: false }))
        .localBrand,
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await resolveWebsiteIcon('https://newproduct.com/tools?private=1', {
      allowPublicService: false,
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://newproduct.com/tools?private=1',
      'https://newproduct.com/favicon.ico',
    ]);
    expect(stored).toEqual({});
  });
});
