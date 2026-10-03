import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWebsiteIcon, publicIconDomain } from '../src/features/navigation/site-metadata';
import { findCatalogIcon } from '../src/features/navigation/brand-catalog';
import { getBrandAppearance } from '../src/features/navigation/brandIcons';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import index from '../src/features/navigation/assets/brand-index.json';

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

  it('obtains original pixels from the provider while direct access is blocked, then cancels the blocked lookup', async () => {
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
    const result = await fetchWebsiteIcon('https://example.com/account?secret=1#profile');
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
    { source: 'link-tag', width: 16, height: 16 },
    { source: 'link-tag', width: 24, height: 24 },
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

  it('waits for a larger direct original instead of cancelling it for a fast 96px service result', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        const size = (await blob.text()) === 'large' ? 192 : 96;
        return { width: size, height: size, close() {} };
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.endsWith('?response=json'))
          return Response.json({ source: 'link-tag', width: 96, height: 96, format: 'png' });
        if (input === 'https://favicon.vemetric.com/example.com')
          return new Response('small', { headers: { 'content-type': 'image/png' } });
        if (input === 'https://example.com/favicon.ico') {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Response('large', { headers: { 'content-type': 'image/png' } });
        }
        return new Response('', { status: 403 });
      }),
    );
    expect(await (await fetchWebsiteIcon('https://example.com')).icon?.text()).toBe('large');
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

describe('bundled community catalog', () => {
  it('covers all verified regional application domains without substituting their parent brand', async () => {
    const apps = JSON.parse(await readFile('scripts/app-brand-sources.json', 'utf8')) as {
      title: string;
      hostname: string;
    }[];
    for (const app of apps) {
      const icon = findCatalogIcon(`https://${app.hostname}`)!;
      expect(icon.title).toBe(app.title);
      expect(icon.tile).toBe(true);
      expect(icon.light).toMatch(/^\/brand-icons\/[a-f\d]+\.(?:png|ico)$/);
      expect(getBrandAppearance(`https://${app.hostname}`)?.tile).toBe(true);
    }
    expect(findCatalogIcon('https://qq.com')).toBeUndefined();
    expect(getBrandAppearance('https://baidu.com')?.tile).not.toBe(true);
  });
  it('uses the full-color TikTok mark and product-specific logos before generic parent brands', () => {
    const tiktok = findCatalogIcon('https://tiktok.com')!;
    expect(renderToStaticMarkup(getBrandAppearance('https://douyin.com')!.graphic)).toContain(
      tiktok.light,
    );
    const music = findCatalogIcon('https://music.youtube.com')!;
    expect(music.title).toBe('Youtube Music');
    expect(
      renderToStaticMarkup(getBrandAppearance('https://music.youtube.com')!.graphic),
    ).toContain(music.light);
    const tieba = getBrandAppearance('https://tieba.baidu.com')!;
    expect(tieba.tile).toBe(true);
    expect(renderToStaticMarkup(tieba.graphic)).toContain(
      findCatalogIcon('https://tieba.baidu.com')!.light,
    );
    expect(getBrandAppearance('https://tieba.baidu.com.example.com')).toBeNull();
  });
  it('covers the full checked-in index with local, hash-verified assets and provenance', async () => {
    const snapshot = JSON.parse(await readFile('public/brand-icons/catalog.json', 'utf8')) as {
      entries: {
        light: { file: string; sha256: string };
        dark?: { file: string; sha256: string };
      }[];
    };
    expect(snapshot.entries).toHaveLength(index.length);
    expect(index.length).toBeGreaterThan(600);
    const assets = new Map(
      snapshot.entries
        .flatMap((entry) => [entry.light, ...(entry.dark ? [entry.dark] : [])])
        .map((asset) => [asset.file, asset]),
    );
    await Promise.all(
      [...assets.values()].map(async ({ file, sha256 }) => {
        const bytes = await readFile(`public/brand-icons/${file}`);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
        if (file.endsWith('.svg'))
          expect(bytes.toString()).not.toMatch(/<(?:script|foreignObject|iframe)\b|\bon\w+\s*=/i);
        else if (file.endsWith('.png')) {
          expect(bytes.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
          expect(Math.min(bytes.readUInt32BE(16), bytes.readUInt32BE(20))).toBeGreaterThanOrEqual(
            64,
          );
        } else {
          expect(bytes.readUInt32LE(0)).toBe(65536);
          expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('matches product paths and exact domains, preserves full-color assets, and never matches suffix lookalikes', () => {
    expect(findCatalogIcon('https://www.figma.com/design')?.light).toMatch(
      /^\/brand-icons\/.*\.svg$/,
    );
    expect(findCatalogIcon('https://chatgpt.com')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://chatgpt.com/codex')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://openai.com/codex')?.title).toBe('Codex');
    expect(findCatalogIcon('https://gemini.google.com/app')?.title).toBe('Gemini');
    expect(findCatalogIcon('https://figma.com.example.com')).toBeUndefined();
    expect(findCatalogIcon('https://example.com/figma.com')).toBeUndefined();
  });
});
