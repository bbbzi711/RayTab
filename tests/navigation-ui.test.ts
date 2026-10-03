import { afterEach, describe, expect, it, vi } from 'vitest';
import { zodResolver } from '@hookform/resolvers/zod';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { ClientRect, CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import { createNavigationCollision } from '../src/features/navigation/NavigationDrag';
import { SiteIcon } from '../src/features/navigation/SiteIcon';
import { getBrandAppearance, getSearchEngineIcon } from '../src/features/navigation/brandIcons';
import { nameSchema, siteEditorSchema } from '../src/features/navigation/navigation-form-schemas';
import {
  fetchSiteIcon,
  fetchSiteMetadata,
  siteFaviconUrl,
} from '../src/features/navigation/site-metadata';
import {
  createInitialState,
  defaultSiteIcon,
  defaultSiteIconBackground,
  siteIconSchema,
  siteIconBackgroundSchema,
} from '../src/storage/model';

afterEach(() => vi.unstubAllGlobals());

const form = {
  title: '  Example  ',
  url: 'example.test/path?q=raytab#section',
  location: { groupId: 'group', folderId: null },
  iconType: defaultSiteIcon.source,
  textIcon: '',
  websiteResourceId: '',
  uploadResourceId: '',
  iconBackground: defaultSiteIconBackground,
};

describe('navigation drag hit areas', () => {
  function fixture() {
    const space = createInitialState().spaces.normal;
    const folder = { ...space.groups[0], id: 'target-folder', groupId: space.groups[0].id };
    space.folders.push(folder);
    const rectangle = (left: number, top: number, width: number, height: number): ClientRect => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });
    const siteId = `site:${space.sites[0].id}`;
    const folderId = `folder:${folder.id}`;
    const centerId = `folder-center:${folder.id}`;
    const sourceRect = rectangle(0, 0, 100, 100);
    const rects = new Map([
      [siteId, sourceRect],
      [folderId, rectangle(200, 0, 100, 100)],
      // The nested center follows a sortable animation into the source slot.
      [centerId, rectangle(25, 25, 50, 50)],
    ]);
    const containers: DroppableContainer[] = [...rects].map(([id, rect]) => ({
      id,
      key: id,
      disabled: false,
      data: { current: {} },
      node: { current: null },
      rect: { current: rect },
    }));
    const args: Parameters<CollisionDetection>[0] = {
      active: {
        id: siteId,
        data: { current: {} },
        rect: { current: { initial: sourceRect, translated: sourceRect } },
      },
      collisionRect: sourceRect,
      droppableRects: rects,
      droppableContainers: containers,
      pointerCoordinates: { x: 250, y: 50 },
    };
    const options = {
      activeDrag: { type: 'site' as const, id: space.sites[0].id },
      selectedFolderId: null,
      space,
    };
    return { args, options, siteId, folderId, centerId, rectangle };
  }

  it('enters the logical folder center even when the inner center has animated elsewhere', () => {
    const { args, options, centerId } = fixture();
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(centerId);
  });

  it('keeps the folder edge available for sibling sorting', () => {
    const { args, options, folderId } = fixture();
    args.pointerCoordinates = { x: 210, y: 50 };
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(folderId);
  });

  it('does not treat the displaced center over the source slot as a folder drop', () => {
    const { args, options, siteId } = fixture();
    args.pointerCoordinates = { x: 50, y: 50 };
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(siteId);
  });

  it('keeps keyboard navigation on sortable items instead of nesting into their center', () => {
    const { args, options, folderId, rectangle } = fixture();
    args.pointerCoordinates = null;
    args.collisionRect = rectangle(225, 25, 50, 50);
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(folderId);
  });

  it('does not enter another folder while dragging a folder or from an open folder', () => {
    const { args, options, folderId } = fixture();
    expect(
      createNavigationCollision({
        ...options,
        activeDrag: { type: 'folder', id: 'other-folder' },
      })(args)[0]?.id,
    ).toBe(folderId);
    expect(
      createNavigationCollision({ ...options, selectedFolderId: 'open-folder' })(args),
    ).toEqual([]);
  });
});

describe('navigation form validation', () => {
  it('passes normalized values through the standard RHF resolver without losing URL details', async () => {
    const resolver = zodResolver(siteEditorSchema);
    const result = await resolver(form, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors).toEqual({});
    expect(result.values).toMatchObject({
      title: 'Example',
      url: 'https://example.test/path?q=raytab#section',
    });
  });

  it.each(['javascript:alert(1)', 'https://user:secret@example.test', '', 'https://'])(
    'keeps invalid URL %s attached to the URL field',
    (url) => {
      const result = siteEditorSchema.safeParse({ ...form, url });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['url']);
    },
  );

  it('validates saved names and complete resource/background choices', () => {
    expect(nameSchema.parse({ name: '  Group  ' })).toEqual({ name: 'Group' });
    expect(nameSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(nameSchema.safeParse({ name: 'A'.repeat(81) }).success).toBe(false);
    expect(siteEditorSchema.safeParse({ ...form, iconType: 'resource' }).success).toBe(false);
    expect(
      siteEditorSchema.safeParse({ ...form, iconBackground: { mode: 'color', color: '#zzzzzz' } })
        .success,
    ).toBe(false);
    expect(
      siteEditorSchema.safeParse({
        ...form,
        iconType: 'resource',
        uploadResourceId: 'local-asset',
        iconBackground: { mode: 'transparent' },
      }).success,
    ).toBe(true);
  });

  it('validates the selected icon only and saves a single source without inactive drafts', () => {
    const selected = {
      ...form,
      textIcon: '  中🙂  ',
      websiteResourceId: 'website-image',
      uploadResourceId: 'upload-image',
    };
    expect(siteEditorSchema.parse({ ...selected, iconType: 'text' }).icon).toEqual({
      source: 'text',
      text: '中🙂',
    });
    expect(siteEditorSchema.parse({ ...selected, iconType: 'auto' }).icon).toEqual({
      source: 'auto',
      resourceId: 'website-image',
    });
    expect(siteEditorSchema.parse({ ...selected, iconType: 'resource' }).icon).toEqual({
      source: 'resource',
      resourceId: 'upload-image',
    });
    expect(siteEditorSchema.parse({ ...form, iconType: 'auto' }).icon).toEqual({ source: 'auto' });
    const empty = siteEditorSchema.safeParse({ ...form, iconType: 'text' });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].path).toEqual(['textIcon']);
  });
});

describe('site icon identity and fetching', () => {
  it('validates one to four Unicode code points instead of UTF-16 units', () => {
    expect(siteIconSchema.parse({ source: 'text', text: '  中a😀🌙  ' })).toEqual({
      source: 'text',
      text: '中a😀🌙',
    });
    expect(siteIconSchema.safeParse({ source: 'text', text: '😀😀😀😀' }).success).toBe(true);
    for (const text of ['', '   ', '😀😀😀😀😀']) {
      const parsed = siteIconSchema.safeParse({ source: 'text', text });
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues[0].message).toBe('navigation.invalidIconText');
    }
  });

  it('renders explicit text unchanged without substituting a known brand or favicon', () => {
    const html = renderToStaticMarkup(
      createElement(SiteIcon, {
        site: {
          title: 'GitHub',
          url: 'https://github.com',
          icon: { source: 'text', text: 'a中😀' },
          iconBackground: defaultSiteIconBackground,
        },
        previewUrl: 'https://example.test/preview.png',
      }),
    );
    expect(html).toContain('a中😀');
    expect(html).toContain('--icon-text-length:3');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('favicon');
  });

  it('matches known domains and subdomains, never keyword or suffix lookalikes', () => {
    expect(getBrandAppearance('https://docs.github.com/path')).not.toBeNull();
    expect(getBrandAppearance('BILIBILI.com')).not.toBeNull();
    expect(getBrandAppearance('https://github.com.example.test')).toBeNull();
    expect(getBrandAppearance('https://notgithub.com')).toBeNull();
    expect(getBrandAppearance('https://example.test/google/github')).toBeNull();
    expect(getBrandAppearance('javascript:github.com')).toBeNull();
    const customEngine = renderToStaticMarkup(getSearchEngineIcon('custom', 'My Google search'));
    expect(customEngine).not.toContain('<svg');
  });

  it('preserves the supplied Google logo colors and brand identity', () => {
    const google = getBrandAppearance('https://google.com')!;
    const html = renderToStaticMarkup(google.graphic);
    expect(html).toContain('#4285F4');
    expect(html).toContain('#EA4335');
    expect(getBrandAppearance('https://github.com')?.foreground).toBe('#24292f');
  });

  it('uses curated vectors by default and preserves saved automatic images and uploaded artwork', () => {
    const site = {
      title: 'Google',
      url: 'https://google.com',
      icon: { source: 'auto' as const },
      iconBackground: defaultSiteIconBackground,
    };
    const automatic = renderToStaticMarkup(createElement(SiteIcon, { site }));
    expect(automatic).toContain('<svg');
    expect(automatic).not.toContain('<img');
    const saved = renderToStaticMarkup(
      createElement(SiteIcon, {
        site: { ...site, icon: { source: 'auto', resourceId: 'saved-cropped-image' } },
        previewUrl: 'https://example.test/saved.png',
      }),
    );
    expect(saved).toContain('<img');
    expect(saved).toContain('https://example.test/saved.png');
    expect(saved).not.toContain('<svg');
    const upload = renderToStaticMarkup(
      createElement(SiteIcon, {
        site: { ...site, icon: { source: 'resource', resourceId: 'custom' } },
        previewUrl: 'https://example.test/custom.png',
      }),
    );
    expect(upload).toContain('<img');
    expect(upload).toContain('background:var(--icon-image-surface)');
    expect(upload).not.toContain('<svg');
  });

  it('uses one neutral fallback for unknown websites while preserving custom backgrounds', () => {
    const render = (url: string, color?: string) =>
      renderToStaticMarkup(
        createElement(SiteIcon, {
          site: {
            title: 'Example',
            url,
            icon: { source: 'auto' },
            iconBackground: color ? { mode: 'color', color } : defaultSiteIconBackground,
          },
        }),
      );
    expect(render('https://example.test')).toContain('background:var(--preferences-icon)');
    expect(render('https://different.test')).toContain('background:var(--preferences-icon)');
    expect(render('https://example.test', '#112233')).toContain('background:#112233');
  });

  it('distinguishes Gemini from Google Search and does not replace other Google product icons', () => {
    const gemini = renderToStaticMarkup(
      getBrandAppearance('https://gemini.google.com/app')!.graphic,
    );
    const google = renderToStaticMarkup(getBrandAppearance('https://www.google.com')!.graphic);
    expect(gemini).toContain('<img');
    expect(gemini).toContain('gemini.svg');
    expect(google).toContain('<svg');
    expect(gemini).not.toEqual(google);
    expect(getBrandAppearance('https://mail.google.com')).toBeNull();
    expect(getBrandAppearance('https://gemini.google.com.example.test')).toBeNull();
  });

  it('preserves familiar brand colors when a user changes the tile background, and keeps monochrome marks readable', () => {
    const render = (url: string, color: string) =>
      renderToStaticMarkup(
        createElement(SiteIcon, {
          site: {
            title: 'Brand',
            url,
            icon: { source: 'auto' },
            iconBackground: { mode: 'color', color },
          },
        }),
      );
    expect(getBrandAppearance('https://youtube.com')?.background).toBe('#ffffff');
    expect(render('https://youtube.com', '#52c41a')).toContain('fill="#ff0033"');
    expect(render('https://bilibili.com', '#262626')).toContain('fill="#fb7299"');
    expect(render('https://deepseek.com', '#ffffff')).toContain('fill="#4d6bfe"');
    const github = render('https://github.com', '#262626');
    expect(github).toContain('fill="currentColor"');
    expect(github).toContain('color:#ffffff');
    expect(render('https://baidu.com', '#ffffff')).toContain('color:#2932e1');
    expect(render('https://baidu.com', '#262626')).toContain('color:#ffffff');
  });

  it('normalizes previously transparent tiles without discarding image references', () => {
    const result = siteEditorSchema.parse({
      ...form,
      iconType: 'resource',
      uploadResourceId: 'kept-image',
      iconBackground: { mode: 'transparent' },
    });
    expect(result.icon).toEqual({ source: 'resource', resourceId: 'kept-image' });
    expect(result.iconBackground).toEqual({ mode: 'auto' });
    expect(siteIconBackgroundSchema.parse({ mode: 'color', color: '#112233' })).toEqual({
      mode: 'color',
      color: '#112233',
    });
  });

  it('loads default icons directly from the site origin without path/query/credentials disclosure', () => {
    expect(siteFaviconUrl('https://example.test:8443/private/path?token=secret#section')).toBe(
      'https://example.test:8443/favicon.ico',
    );
    expect(siteFaviconUrl('example.test/path')).toBe('https://example.test/favicon.ico');
    expect(siteFaviconUrl('https://user:secret@example.test')).toBeUndefined();
    expect(siteFaviconUrl('file:///private')).toBeUndefined();
  });

  it('rejects HTML from an icon URL and falls back only to that site favicon', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 128, height: 128, close() {} }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0, 0, 1, 0]), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const blob = await fetchSiteIcon(
      'https://cdn.example.test/large.ico',
      'https://example.test/private?token=secret',
    );
    expect(blob?.type).toBe('image/x-icon');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://cdn.example.test/large.ico',
      'https://example.test/favicon.ico',
    ]);
  });

  it('tries the next declared icon when a favicon is low resolution, corrupt or unavailable', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockResolvedValueOnce({ width: 16, height: 16, close })
        .mockRejectedValueOnce(new Error('bad image'))
        .mockResolvedValueOnce({ width: 192, height: 192, close }),
    );
    vi.stubGlobal(
      'Image',
      class {
        onerror?: () => void;
        set src(_value: string) {
          this.onerror?.();
        }
      },
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
          ),
        ),
    );
    const result = await fetchSiteIcon('https://example.test/tiny.png', 'https://example.test', [
      'https://example.test/broken.png',
      'https://example.test/touch.png',
    ]);
    expect(result?.type).toBe('image/png');
    expect(close).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/tiny.png',
      'https://example.test/broken.png',
      'https://example.test/touch.png',
    ]);
  });

  it('does not retry the same failed default favicon or accept empty images', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSiteIcon(undefined, 'https://example.test')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefers a larger declared icon over a usable 96px candidate', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockResolvedValueOnce({ width: 96, height: 96, close() {} })
        .mockResolvedValueOnce({ width: 192, height: 192, close() {} }),
    );
    const small = new Blob(['small'], { type: 'image/png' });
    const large = new Blob(['large'], { type: 'image/png' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => new Response(input.endsWith('small.png') ? small : large)),
    );
    const icon = await fetchSiteIcon('https://example.test/small.png', undefined, [
      'https://example.test/large.png',
    ]);
    expect(await icon?.text()).toBe('large');
  });

  it('accepts a small SVG viewbox and normalizes content-type parameters without treating it as a tiny bitmap', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 24, height: 24, close() {} }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>', {
          headers: { 'content-type': 'image/svg+xml; charset=utf-8' },
        }),
      ),
    );
    const icon = await fetchSiteIcon('https://example.test/icon.svg', 'https://example.test');
    expect(icon?.type).toBe('image/svg+xml');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit metadata fetch failures local to the requested website', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const result = await fetchSiteMetadata('https://example.test/path?q=value');
    expect(result.iconUrl).toBe('https://example.test/favicon.ico');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://example.test/path?q=value']);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
  });
});
