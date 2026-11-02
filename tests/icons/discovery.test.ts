import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSiteIcon, resolveWebsiteIcon } from '../../src/features/navigation/site-metadata';
import { prepareImage } from '../../src/lib/images';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function decodeImages(dimensions: Record<string, [number, number]>) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (blob: Blob) => {
      const size = dimensions[await blob.text()];
      if (!size) throw new Error('Broken image');
      return { width: size[0], height: size[1], close() {} };
    }),
  );
}

describe('official website icon discovery', () => {
  it('compares actual pixels, ignores broken and wide artwork, and retains original bytes', async () => {
    decodeImages({ tiny: [8, 8], small: [128, 128], large: [512, 512], header: [1024, 256] });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: string) =>
          new Response(input.split('/').at(-1), { headers: { 'content-type': 'image/png' } }),
      ),
    );
    const icon = await fetchSiteIcon([
      'https://example.com/tiny',
      'https://example.com/small',
      'https://example.com/broken',
      'https://example.com/header',
      'https://example.com/large',
    ]);
    expect(icon?.image.type).toBe('image/png');
    expect(await icon?.image.text()).toBe('large');
  });

  it('tries the origin favicon when website discovery finds no usable artwork', async () => {
    decodeImages({ original: [48, 48] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input === 'https://example.com/favicon.ico'
          ? new Response('original', { headers: { 'content-type': 'image/png' } })
          : new Response('', { status: 404 }),
      ),
    );
    const result = await resolveWebsiteIcon('https://example.com/page');
    expect(await result.icon?.text()).toBe('original');
  });

  it.each([16, 32, 48, 192])(
    'retains a usable %ipx official favicon when the page is unavailable',
    async (size) => {
      decodeImages({ original: [size, size] });
      const calls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string, options: RequestInit) => {
          calls.push(input);
          expect(options.credentials).toBe('omit');
          expect(options.referrerPolicy).toBe('no-referrer');
          return input === 'https://example.com/favicon.ico'
            ? new Response('original', { headers: { 'content-type': 'image/png' } })
            : new Response('', { status: 403 });
        }),
      );
      const result = await resolveWebsiteIcon('https://example.com/account?token=keep#profile');
      expect(await result.icon?.text()).toBe('original');
      expect(calls.every((url) => new URL(url).origin === 'https://example.com')).toBe(true);
    },
  );

  it('reports no image after network failure instead of substituting a brand or placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    expect((await resolveWebsiteIcon('https://github.com')).icon).toBeUndefined();
  });

  it('bounds stalled website lookups and cancels unfinished requests', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () => {
              cancelled = true;
              reject(new DOMException('Aborted', 'AbortError'));
            };
            options.signal?.addEventListener('abort', abort);
            if (options.signal?.aborted) abort();
          }),
      ),
    );
    const result = resolveWebsiteIcon('https://example.com');
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await result).icon).toBeUndefined();
    expect(cancelled).toBe(true);
  });
});

describe('icon persistence preparation', () => {
  it.each([32, 128, 512])(
    'keeps original PNG bytes and %ipx dimensions when resizing is unnecessary',
    async (size) => {
      decodeImages({ pixels: [size, size] });
      const image = new Blob(['pixels'], { type: 'image/png' });
      const prepared = await prepareImage(image, 'icon');
      expect(prepared.blob.type).toBe('image/png');
      expect(await prepared.blob.arrayBuffer()).toEqual(await image.arrayBuffer());
    },
  );
});

describe('website artwork priority and fallback', () => {
  function network({ touch = false, declared = false } = {}) {
    decodeImages({ favicon: [32, 32], touch: [180, 180], declared: [48, 48] });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.endsWith('/favicon.ico'))
          return new Response('favicon', { headers: { 'content-type': 'image/png' } });
        if (touch && input.endsWith('/apple-touch-icon.png'))
          return new Response('touch', { headers: { 'content-type': 'image/png' } });
        if (declared && input === 'https://example.com/')
          return new Response('<title>Example</title><link rel="icon" href="/declared.png">', {
            headers: { 'content-type': 'text/html' },
          });
        if (declared && input.endsWith('/declared.png'))
          return new Response('declared', { headers: { 'content-type': 'image/png' } });
        return new Response('', { status: 404 });
      }),
    );
    return calls;
  }

  it('discovers a conventional high-resolution Touch Icon ahead of a small favicon', async () => {
    const calls = network({ touch: true });
    const result = await resolveWebsiteIcon('https://example.com');
    expect(await result.icon?.text()).toBe('touch');
    expect(result.iconSource).toMatchObject({
      kind: 'website',
      url: 'https://example.com/apple-touch-icon.png',
    });
    expect(calls.every((url) => new URL(url).origin === 'https://example.com')).toBe(true);
  });

  it('retains the clearest available official image without consulting an external service', async () => {
    const calls = network({ declared: true });
    const result = await resolveWebsiteIcon('https://example.com');
    expect(await result.icon?.text()).toBe('declared');
    expect(result.iconSource).toMatchObject({
      kind: 'website',
      url: 'https://example.com/declared.png',
    });
    expect(calls.every((url) => new URL(url).origin === 'https://example.com')).toBe(true);
    expect(await (await prepareImage(result.icon!, 'icon')).blob.text()).toBe('declared');
  });
});
