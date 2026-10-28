import { normalizeUrl } from '@/storage/model';
import { imageDimensions, validateImageFile } from '@/lib/images';
import { validateSvgImage } from '@/lib/svg';
import { z } from 'zod';
import { findPublicCatalogIcon } from './brand-catalog';
import { getBrandAppearance } from './brandIcons';

export type SiteMetadata = {
  title: string;
  iconUrl?: string;
  iconUrls?: string[];
  manifestUrl?: string;
};

type IconCandidate = { image: Blob; score: number; highQuality: boolean };
const compareIcons = (a: IconCandidate, b: IconCandidate) =>
  Number(b.highQuality) - Number(a.highQuality) || b.score - a.score;

async function inspectIcon(image: Blob): Promise<IconCandidate | undefined> {
  const { width, height } = await imageDimensions(image);
  const size = Math.min(width, height);
  const ratio = Math.max(width, height) / size;
  const vector = image.type === 'image/svg+xml';
  // Wide header logos and tiny favicons are not suitable launcher artwork.
  if (!Number.isFinite(ratio) || ratio > 2 || (!vector && size < 32)) return undefined;
  return {
    image,
    score: (vector ? 1_024 : Math.min(size, 512)) / ratio,
    highQuality: ratio <= 1.5 && (vector || size >= 128),
  };
}

async function bestIcon(images: (Blob | undefined)[]) {
  const candidates = await Promise.all(
    images.map(async (image) => {
      try {
        return image ? await inspectIcon(image) : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return candidates
    .filter((candidate): candidate is IconCandidate => Boolean(candidate))
    .sort(compareIcons)[0];
}

export function siteFaviconUrl(rawUrl: string) {
  try {
    const origin = new URL(normalizeUrl(rawUrl)).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

const KNOWN_DOMAINS: Record<string, string> = {
  'github.com': 'GitHub',
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'deepseek.com': 'DeepSeek',
  'csdn.net': 'CSDN',
  'google.com': 'Google',
  'gemini.google.com': 'Google Gemini',
  'bilibili.com': '哔哩哔哩',
  'youtube.com': 'YouTube',
  'twitter.com': 'X / Twitter',
  'x.com': 'X',
  'weibo.com': '微博',
  'zhihu.com': '知乎',
  'v2ex.com': 'V2EX',
  'notion.so': 'Notion',
  'juejin.cn': '稀土掘金',
  'douban.com': '豆瓣',
  'taobao.com': '淘宝',
  'jd.com': '京东',
  'baidu.com': '百度',
  'tieba.baidu.com': '贴吧',
  'bing.com': '必应',
  'stackoverflow.com': 'Stack Overflow',
  'reddit.com': 'Reddit',
  'wikipedia.org': '维基百科',
};

export function formatDomainTitle(hostname: string): string {
  const cleanHost = hostname.replace(/^www\./i, '').toLowerCase();
  if (KNOWN_DOMAINS[cleanHost]) return KNOWN_DOMAINS[cleanHost];

  for (const [domain, name] of Object.entries(KNOWN_DOMAINS)) {
    if (cleanHost.endsWith(`.${domain}`)) {
      const sub = cleanHost.slice(0, -(domain.length + 1));
      return `${sub.charAt(0).toUpperCase() + sub.slice(1)} - ${name}`;
    }
  }

  const parts = cleanHost.split('.');
  const name = parts[0] || cleanHost;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function extractSiteMetadata(html: string, pageUrl: string): SiteMetadata {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title =
    document.querySelector('meta[property="og:site_name" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('meta[name="application-name" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('meta[property="og:title" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    formatDomainTitle(new URL(pageUrl).hostname);
  const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel][href]'))
    .filter((link) => /(^|\s)(icon|apple-touch-icon(?:-precomposed)?)(\s|$)/i.test(link.rel))
    .flatMap((link) => {
      let url: URL;
      try {
        url = new URL(link.getAttribute('href')!, pageUrl);
      } catch {
        return [];
      }
      const sizes = link.sizes?.value || link.getAttribute('sizes') || '';
      const resolution = Math.max(
        0,
        ...Array.from(sizes.matchAll(/(\d+)x(\d+)/g), (size) =>
          Math.min(Number(size[1]), Number(size[2])),
        ),
      );
      return [
        {
          url,
          score:
            /\bany\b/i.test(sizes) || link.type === 'image/svg+xml' || /\.svg$/i.test(url.pathname)
              ? 10_000
              : resolution || (/apple-touch-icon/i.test(link.rel) ? 180 : 0),
        },
      ];
    })
    .filter(
      ({ url }) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
    )
    .sort((a, b) => b.score - a.score);
  return {
    title: title.slice(0, 80),
    iconUrl: icons[0]?.url.href ?? siteFaviconUrl(pageUrl),
    iconUrls: [...new Set(icons.map(({ url }) => url.href))],
    manifestUrl: resolveImageUrl(
      document.querySelector('link[rel="manifest" i]')?.getAttribute('href'),
      pageUrl,
    ),
  };
}

export async function fetchSiteMetadata(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<SiteMetadata> {
  const url = normalizeUrl(rawUrl);
  const parsedUrl = new URL(url);

  // Manifest host permissions already cover user-initiated HTTP(S) lookups.
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      redirect: 'follow',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(3_000)])
        : AbortSignal.timeout(6_000),
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        return extractSiteMetadata(await response.text(), response.url || url);
      }
    }
  } catch {
    // If fetch failed (CORS, network error, or offline), gracefully fallback without throwing error
  }

  // A direct favicon remains available when the page cannot be read.
  return {
    title: formatDomainTitle(parsedUrl.hostname),
    iconUrl: siteFaviconUrl(url),
  };
}

export async function fetchSiteIcon(
  iconUrl?: string,
  pageUrl?: string,
  iconUrls: string[] = [],
  signal?: AbortSignal,
  redirect: RequestRedirect = 'follow',
) {
  const targetUrl = iconUrl || (pageUrl ? siteFaviconUrl(pageUrl) : undefined);
  if (!targetUrl) return undefined;

  const tryFetch = async (src: string) => {
    if (signal?.aborted) return undefined;
    try {
      const response = await fetch(src, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-cache',
        redirect,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(2_500)])
          : AbortSignal.timeout(6_000),
      });
      if (!response.ok) return undefined;
      const blob = await response.blob();
      const type = blob.type.toLowerCase().split(';')[0].trim();
      const isImage =
        type.startsWith('image/') ||
        ((!type || type === 'application/octet-stream') &&
          /\.(ico|png|jpe?g|webp|svg)(\?.*)?$/i.test(src));
      if (!isImage || blob.size === 0) return undefined;
      const normalizedType =
        type && type !== 'application/octet-stream'
          ? type
          : /\.(ico)(\?.*)?$/i.test(src)
            ? 'image/x-icon'
            : /\.(svg)(\?.*)?$/i.test(src)
              ? 'image/svg+xml'
              : blob.type || 'image/png';
      const image =
        normalizedType === blob.type ? blob : new Blob([blob], { type: normalizedType });
      if (normalizedType === 'image/svg+xml') {
        validateImageFile(image);
        await validateSvgImage(image);
      }
      return await inspectIcon(image);
    } catch {
      return undefined;
    }
  };

  const candidates = [...new Set([targetUrl, ...iconUrls])].slice(0, 6);
  const results = await Promise.all(candidates.map(tryFetch));
  const ranked = results
    .filter((candidate): candidate is IconCandidate => Boolean(candidate))
    .sort(compareIcons);
  if (ranked[0]?.highQuality) return ranked[0].image;
  const favicon = pageUrl ? siteFaviconUrl(pageUrl) : undefined;
  if (favicon && !candidates.includes(favicon) && candidates.length < 6) {
    const fallback = await tryFetch(favicon);
    if (fallback) ranked.push(fallback);
    ranked.sort(compareIcons);
  }
  return ranked[0]?.image;
}

function resolveImageUrl(src: string | null | undefined, base: string) {
  if (!src) return undefined;
  try {
    const url = new URL(src, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Only public DNS names are ever disclosed to the public icon provider. */
export function publicIconDomain(rawUrl: string) {
  try {
    const url = new URL(normalizeUrl(rawUrl));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      url.port ||
      /^[\d.]+$/.test(host) ||
      !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]+$/i.test(host) ||
      /\.(?:localhost|local|lan|internal|intranet|home|arpa|onion|test|invalid|example)$/.test(host)
    )
      return undefined;
    return host;
  } catch {
    return undefined;
  }
}

const providerMetadata = z.object({
  source: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  format: z.string(),
});
const manifestSchema = z.object({
  icons: z
    .array(
      z.object({
        src: z.string(),
        sizes: z.string().optional(),
        type: z.string().optional(),
        purpose: z.string().optional(),
      }),
    )
    .default([]),
});

async function manifestIcons(url: string | undefined, signal: AbortSignal) {
  if (!url) return [];
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      signal: AbortSignal.any([signal, AbortSignal.timeout(1_500)]),
    });
    if (!response.ok) return [];
    const manifest = manifestSchema.parse(await response.json());
    return (
      manifest.icons
        // Maskable-only artwork requires a mask; monochrome artwork requires tinting.
        .filter((icon) => (icon.purpose ?? 'any').split(/\s+/).includes('any'))
        .map((icon) => ({
          url: resolveImageUrl(icon.src, response.url || url),
          score:
            icon.type === 'image/svg+xml' || icon.sizes === 'any'
              ? 10_000
              : Math.max(
                  0,
                  ...Array.from((icon.sizes ?? '').matchAll(/(\d+)x(\d+)/g), (size) =>
                    Math.min(+size[1], +size[2]),
                  ),
                ),
        }))
        .sort((a, b) => b.score - a.score)
        .flatMap((icon) => (icon.url ? [icon.url] : []))
    );
  } catch {
    return [];
  }
}

async function providerIcon(domain: string, signal: AbortSignal) {
  // The deployed API and its current validator preserve original pixels without size.
  // Its website still documents an older default of 64; verify downloaded pixels too.
  const endpoint = `https://favicon.vemetric.com/${domain}`;
  try {
    const response = await fetch(`${endpoint}?response=json`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      redirect: 'error',
      signal,
    });
    if (!response.ok) return undefined;
    const metadata = providerMetadata.parse(await response.json());
    if (
      metadata.source === 'default' ||
      (metadata.format !== 'svg' && Math.min(metadata.width, metadata.height) < 32)
    )
      return undefined;
    // Download from the service, never from metadata.sourceUrl (which may be unreachable locally).
    let icon = await fetchSiteIcon(endpoint, undefined, [], signal, 'error');
    if (!icon || metadata.format === 'svg') return icon;
    const originalSize = Math.min(metadata.width, metadata.height);
    const dimensions = await imageDimensions(icon);
    const actualSize = Math.min(dimensions.width, dimensions.height);
    // Never treat a service-resized image as proof of a high-resolution original.
    if (actualSize > originalSize) return undefined;
    if (actualSize < Math.min(originalSize, 256) && originalSize <= 512) {
      icon = await fetchSiteIcon(
        `${endpoint}?size=${originalSize}`,
        undefined,
        [],
        signal,
        'error',
      );
      if (!icon) return undefined;
      const resized = await imageDimensions(icon);
      if (Math.min(resized.width, resized.height) !== originalSize) return undefined;
    }
    return icon;
  } catch {
    return undefined;
  }
}

async function catalogWebsiteIcon(url: string, signal: AbortSignal) {
  try {
    const catalog = await findPublicCatalogIcon(url);
    if (!catalog || signal.aborted) return undefined;
    const icon = await fetchSiteIcon(
      catalog.light,
      undefined,
      [],
      AbortSignal.any([signal, AbortSignal.timeout(2_500)]),
      'error',
    );
    if (icon?.type === 'image/svg+xml')
      return { title: catalog.title, icon, background: '#ffffff' };
  } catch {
    // A failed public directory must not discard a usable website or provider image.
  }
}

async function discoverWebsiteIcon(
  rawUrl: string,
  {
    allowPublicService = true,
    localBrand = false,
    publicCatalog = false,
  }: { allowPublicService?: boolean; localBrand?: boolean; publicCatalog?: boolean } = {},
): Promise<{ title: string; icon?: Blob; background?: string }> {
  const url = normalizeUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), localBrand ? 3_000 : 8_000);
  const signal = controller.signal;
  let title = formatDomainTitle(new URL(url).hostname);
  const direct = (async () => {
    const metadata = await fetchSiteMetadata(url, signal);
    title = metadata.title;
    const declared = fetchSiteIcon(metadata.iconUrl, url, metadata.iconUrls, signal);
    const manifest = (async () => {
      const icons = await manifestIcons(metadata.manifestUrl, signal);
      return icons.length ? fetchSiteIcon(icons[0], undefined, icons.slice(1), signal) : undefined;
    })();
    return bestIcon(await Promise.all([declared, manifest]));
  })();
  // The public directory receives no user domain. Only unknown brands use the domain API.
  const domain = allowPublicService ? publicIconDomain(url) : undefined;
  const catalog = domain && publicCatalog ? catalogWebsiteIcon(url, signal) : undefined;
  const provider = domain && !localBrand ? providerIcon(domain, signal) : undefined;
  try {
    // Curated vectors take precedence over even a high-resolution website bitmap.
    const catalogResult = await catalog;
    if (catalogResult) return catalogResult;
    const original = await direct;
    if (original?.highQuality) return { title, icon: original.image };
    if (localBrand) return { title };
    const fallback = await bestIcon([original?.image, await provider]);
    return { title, icon: fallback?.image };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export async function fetchWebsiteIcon(
  rawUrl: string,
  options: { allowPublicService?: boolean } = {},
) {
  return discoverWebsiteIcon(rawUrl, options);
}

/** Explicit icon discovery. Saved site resources are persisted by the editor's transaction. */
export async function resolveWebsiteIcon(
  rawUrl: string,
  { allowPublicService = true }: { allowPublicService?: boolean } = {},
): Promise<{
  title: string;
  icon?: Blob;
  background?: string;
  localBrand: boolean;
  localFallback?: boolean;
}> {
  const url = normalizeUrl(rawUrl);
  const local = getBrandAppearance(url);
  if (local && !local.tile)
    return {
      title: formatDomainTitle(new URL(url).hostname),
      background: local.background,
      localBrand: true,
    };
  const result = await discoverWebsiteIcon(url, {
    allowPublicService,
    localBrand: Boolean(local),
    publicCatalog: true,
  });
  if (result.icon) return { ...result, localBrand: false };
  return {
    ...result,
    background: local?.background,
    localBrand: Boolean(local),
    localFallback: Boolean(local),
  };
}
