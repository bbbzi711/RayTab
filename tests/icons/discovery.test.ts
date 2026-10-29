import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSiteIcon,
  fetchWebsiteIcon,
  publicIconDomain,
} from '../../src/features/navigation/site-metadata';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public favicon requests', () => {
  it.each([
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://[::1]',
    'http://[fd00::1]',
    'http://localhost',
    'https://nas.local',
    'https://app.internal',
    'https://private.test',
    'https://company',
    'https://example.com:8443',
    'https://user:password@example.com',
    'file:///etc/passwd',
  ])('keeps private or non-web locations off the public provider: %s', (url) => {
    expect(publicIconDomain(url)).toBeUndefined();
  });

  it('discloses only the hostname, without a path, parameters, fragment or credentials', () => {
    expect(publicIconDomain('https://example.com/Private?token=secret#section')).toBe(
      'example.com',
    );
    expect(publicIconDomain('https://example.com.evil.local')).toBeUndefined();
  });

  it('uses verified provider pixels after the blocked origin exhausts the shared lookup budget', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const calls: string[] = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 192, height: 192, close() {} }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, options: RequestInit) => {
        calls.push(input);
        expect(options.credentials).toBe('omit');
        expect(options.referrerPolicy).toBe('no-referrer');
        if (input.endsWith('?response=json'))
          return Promise.resolve(
            Response.json({
              source: 'link-tag',
              width: 192,
              height: 192,
              format: 'png',
              sourceUrl: 'https://blocked.example.com/touch.png',
            }),
          );
        if (input === 'https://favicon.vemetric.com/example.com')
          return Promise.resolve(
            new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
          );
        return new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            cancelled = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );
    const pending = fetchWebsiteIcon('https://example.com/account?secret=1#profile');
    await vi.advanceTimersByTimeAsync(8_001);
    const result = await pending;
    expect(result.icon?.type).toBe('image/png');
    expect(cancelled).toBe(true);
    expect(calls).toEqual([
      'https://example.com/account?secret=1#profile',
      'https://favicon.vemetric.com/example.com?response=json',
      'https://favicon.vemetric.com/example.com',
    ]);
    expect(calls.filter((call) => call.includes('vemetric')).join(' ')).not.toMatch(
      /secret|account|sourceUrl|size=/,
    );
  });

  it.each([
    { source: 'default', width: 256, height: 256 },
    { source: 'link-tag', width: 31, height: 31 },
  ])(
    'rejects a placeholder or tiny original instead of requesting an upscaled version',
    async (metadata) => {
      const calls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string) => {
          calls.push(input);
          return input.includes('vemetric')
            ? Response.json({ ...metadata, format: 'png' })
            : new Response('', { status: 404 });
        }),
      );
      expect((await fetchWebsiteIcon('https://example.com')).icon).toBeUndefined();
      expect(calls.filter((call) => call.includes('vemetric'))).toEqual([
        'https://favicon.vemetric.com/example.com?response=json',
      ]);
    },
  );

  it.each([96, 256])(
    'prefers an official original even after a %ipx public result is ready',
    async (serviceSize) => {
      let ready!: () => void;
      const serviceReady = new Promise<void>((resolve) => {
        ready = resolve;
      });
      let release!: (response: Response) => void;
      const original = new Promise<Response>((resolve) => {
        release = resolve;
      });
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async (blob: Blob) => {
          const size = (await blob.text()) === 'official' ? 192 : serviceSize;
          if ((await blob.text()) === 'cached') ready();
          return { width: size, height: size, close() {} };
        }),
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string) => {
          if (input.endsWith('?response=json'))
            return Response.json({
              source: 'link-tag',
              width: serviceSize,
              height: serviceSize,
              format: 'png',
            });
          if (input === 'https://favicon.vemetric.com/example.com')
            return new Response('cached', { headers: { 'content-type': 'image/png' } });
          if (input === 'https://example.com/favicon.ico') return original;
          return new Response('', { status: 403 });
        }),
      );
      const lookup = fetchWebsiteIcon('https://example.com');
      await serviceReady;
      release(new Response('official', { headers: { 'content-type': 'image/png' } }));
      expect(await (await lookup).icon?.text()).toBe('official');
    },
  );

  it('compares actual dimensions beyond the first 128px candidate and rejects a wide header logo', async () => {
    const dimensions: Record<string, [number, number]> = {
      small: [128, 128],
      large: [512, 512],
      header: [1024, 256],
    };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        const [width, height] = dimensions[await blob.text()];
        return { width, height, close() {} };
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: string) =>
          new Response(input.split('/').at(-1), { headers: { 'content-type': 'image/png' } }),
      ),
    );
    const icon = await fetchSiteIcon('https://example.com/small', undefined, [
      'https://example.com/header',
      'https://example.com/large',
    ]);
    expect(await icon?.text()).toBe('large');
  });

  it('recovers original pixels if a provider deployment still shrinks images to its documented 64px default', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        const size = (await blob.text()) === 'original' ? 192 : 64;
        return { width: size, height: size, close() {} };
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input);
        if (input.endsWith('?response=json'))
          return Response.json({ source: 'link-tag', width: 192, height: 192, format: 'png' });
        if (input === 'https://favicon.vemetric.com/example.com?size=192')
          return new Response('original', { headers: { 'content-type': 'image/png' } });
        if (input === 'https://favicon.vemetric.com/example.com')
          return new Response('shrunk', { headers: { 'content-type': 'image/png' } });
        return new Response('', { status: 404 });
      }),
    );
    expect(await (await fetchWebsiteIcon('https://example.com')).icon?.text()).toBe('original');
    expect(calls).toContain('https://favicon.vemetric.com/example.com?size=192');
  });

  it('rejects service pixels larger than the verified original instead of treating upscaling as quality', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 192, height: 192, close() {} }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.endsWith('?response=json'))
          return Response.json({ source: 'link-tag', width: 96, height: 96, format: 'png' });
        if (input === 'https://favicon.vemetric.com/example.com')
          return new Response('upscaled', { headers: { 'content-type': 'image/png' } });
        return new Response('', { status: 404 });
      }),
    );
    expect((await fetchWebsiteIcon('https://example.com')).icon).toBeUndefined();
  });

  it('does not contact the provider for a private-space public website', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        calls.push(input);
        return new Response('', { status: 404 });
      }),
    );
    await fetchWebsiteIcon('https://example.com/private', { allowPublicService: false });
    expect(calls).toEqual(['https://example.com/private', 'https://example.com/favicon.ico']);
  });

  it.each([32, 64, 96])(
    'retains a usable %ipx original when no higher-resolution source exists',
    async (size) => {
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockResolvedValue({ width: size, height: size, close() {} }),
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string) => {
          if (input.endsWith('?response=json'))
            return Response.json({ source: 'link-tag', width: size, height: size, format: 'png' });
          if (input === 'https://favicon.vemetric.com/example.com')
            return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
          return new Response('', { status: 404 });
        }),
      );
      expect((await fetchWebsiteIcon('https://example.com')).icon?.type).toBe('image/png');
    },
  );

  it('bounds the whole lookup, including a stalled direct website and public provider', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
            if (options.signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
          }),
      ),
    );
    const result = fetchWebsiteIcon('https://example.com');
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await result).icon).toBeUndefined();
  });
});
