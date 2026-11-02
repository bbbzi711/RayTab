import { normalizeUrl } from '@/storage/model';
import { imageDimensions, validateImageFile } from '@/lib/images';
import { validateSvgImage } from '@/lib/svg';
import { z } from 'zod';
import { Parser } from 'htmlparser2';

export type SiteMetadata = {
  title: string;
  iconUrl?: string;
  iconUrls?: string[];
  manifestUrl?: string;
};

type IconCandidate = { image: Blob; url: string; score: number; highQuality: boolean };
const compareIcons = (a: IconCandidate, b: IconCandidate) =>
  Number(b.highQuality) - Number(a.highQuality) || b.score - a.score;

async function inspectIcon(image: Blob, url: string): Promise<IconCandidate | undefined> {
  const { width, height } = await imageDimensions(image);
  const size = Math.min(width, height);
  const ratio = Math.max(width, height) / size;
  const vector = image.type === 'image/svg+xml';
  // Prefer square artwork; retain a small official favicon when it is the only usable image.
  if (!Number.isFinite(ratio) || ratio > 2 || (!vector && size < 16)) return undefined;
  return {
    image,
    url,
    score: (vector ? 1_024 : Math.min(size, 512)) / ratio,
    highQuality: ratio <= 1.5 && (vector || size >= 128),
  };
}

function bestIcon(candidates: (IconCandidate | undefined)[]) {
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

type MetadataElement = {
  tag: string;
  attributes: Record<string, string>;
  text: string;
};

function metadataElements(html: string) {
  const elements: MetadataElement[] = [];
  let textElement: MetadataElement | undefined;
  let templateDepth = 0;
  // Browser DOM parsers can report CSP violations for event attributes even in
  // inert documents. Read metadata as data, without creating browser elements.
  const parser = new Parser(
    {
      onopentag(tag, attributes) {
        if (tag === 'template') templateDepth++;
        if (templateDepth || !['base', 'meta', 'link', 'title', 'script'].includes(tag)) return;
        if (tag === 'script' && attributes.type?.trim().toLowerCase() !== 'application/ld+json')
          return;
        const element = { tag, attributes, text: '' };
        elements.push(element);
        if (tag === 'title' || tag === 'script') textElement = element;
      },
      ontext(text) {
        if (textElement) textElement.text += text;
      },
      onclosetag(tag) {
        if (tag === 'template') templateDepth--;
        if (textElement?.tag === tag) textElement = undefined;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return elements;
}

function structuredSiteLogos(elements: MetadataElement[], pageUrl: string, base: string) {
  const hostname = new URL(pageUrl).hostname.replace(/^www\./i, '');
  const urls: string[] = [];
  const imageUrl = (value: unknown) => {
    if (typeof value === 'string') return resolveImageUrl(value, base);
    if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string')
      return resolveImageUrl(value.url, base);
    return undefined;
  };
  for (const script of elements.filter((element) => element.tag === 'script')) {
    try {
      const data: unknown = JSON.parse(script.text);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        // Website branding only. Hiring organizations, products and authors can belong to other brands.
        if (!('@type' in node) || !['WebSite', 'Organization'].includes(String(node['@type'])))
          continue;
        if (!('url' in node) || typeof node.url !== 'string') continue;
        const identityUrl = resolveImageUrl(node.url, base);
        if (!identityUrl) continue;
        const identity = new URL(identityUrl);
        if (identity.hostname.replace(/^www\./i, '') !== hostname || identity.pathname !== '/')
          continue;
        const logo = 'logo' in node ? imageUrl(node.logo) : undefined;
        if (logo) urls.push(logo);
      }
    } catch {
      // Malformed structured metadata does not invalidate the website's declared icons.
    }
  }
  return urls;
}

export function extractSiteMetadata(html: string, pageUrl: string): SiteMetadata {
  const elements = metadataElements(html);
  const meta = (attribute: 'name' | 'property', value: string) =>
    elements
      .find(
        (element) =>
          element.tag === 'meta' && element.attributes[attribute]?.toLowerCase() === value,
      )
      ?.attributes.content?.trim();
  const base =
    resolveImageUrl(
      elements.find((element) => element.tag === 'base' && 'href' in element.attributes)?.attributes
        .href,
      pageUrl,
    ) ?? pageUrl;
  const title =
    meta('property', 'og:site_name') ||
    meta('name', 'application-name') ||
    meta('property', 'og:title') ||
    elements.find((element) => element.tag === 'title')?.text.trim() ||
    formatDomainTitle(new URL(pageUrl).hostname);
  const icons = elements
    .filter(
      (element) =>
        element.tag === 'link' &&
        'href' in element.attributes &&
        /(^|\s)(icon|fluid-icon|apple-touch-icon(?:-precomposed)?)(\s|$)/i.test(
          element.attributes.rel ?? '',
        ),
    )
    .flatMap(({ attributes }) => {
      let url: URL;
      try {
        url = new URL(attributes.href, base);
      } catch {
        return [];
      }
      const sizes = attributes.sizes ?? '';
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
            /\bany\b/i.test(sizes) ||
            attributes.type === 'image/svg+xml' ||
            /\.svg$/i.test(url.pathname)
              ? 10_000
              : resolution || (/apple-touch-icon/i.test(attributes.rel) ? 180 : 0),
        },
      ];
    })
    .filter(
      ({ url }) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
    )
    .sort((a, b) => b.score - a.score);
  return {
    title: title.slice(0, 80),
    iconUrl: icons[0]?.url.href,
    iconUrls: [
      ...new Set([
        ...icons.map(({ url }) => url.href),
        ...elements
          .filter(
            (element) =>
              element.tag === 'meta' &&
              /^msapplication-(?:TileImage|square\d+x\d+logo)$/i.test(
                element.attributes.name ?? '',
              ),
          )
          .flatMap(({ attributes }) => {
            const url = resolveImageUrl(attributes.content, base);
            return url ? [url] : [];
          }),
        ...structuredSiteLogos(elements, pageUrl, base),
      ]),
    ],
    manifestUrl: resolveImageUrl(
      elements.find(
        (element) => element.tag === 'link' && element.attributes.rel?.toLowerCase() === 'manifest',
      )?.attributes.href,
      base,
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
  };
}

async function fetchIcon(src: string, signal?: AbortSignal): Promise<IconCandidate | undefined> {
  if (signal?.aborted) return undefined;
  try {
    const response = await fetch(src, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      redirect: 'follow',
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
        : /\.ico(\?.*)?$/i.test(src)
          ? 'image/x-icon'
          : /\.svg(\?.*)?$/i.test(src)
            ? 'image/svg+xml'
            : 'image/png';
    const image = normalizedType === blob.type ? blob : new Blob([blob], { type: normalizedType });
    validateImageFile(image);
    if (normalizedType === 'image/svg+xml') await validateSvgImage(image);
    return await inspectIcon(image, src);
  } catch {
    return undefined;
  }
}

export async function fetchSiteIcon(urls: string[], signal?: AbortSignal) {
  return bestIcon(
    await Promise.all([...new Set(urls)].slice(0, 6).map((url) => fetchIcon(url, signal))),
  );
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

export type WebsiteIconResult = {
  title: string;
  icon?: Blob;
  iconSource?: {
    kind: 'website' | 'favicon';
    url: string;
  };
};

/** Prefer usable official artwork, falling back to the website's own favicon. */
export async function resolveWebsiteIcon(rawUrl: string): Promise<WebsiteIconResult> {
  const url = normalizeUrl(rawUrl);
  const website = new URL(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const signal = controller.signal;
  // Keep a usable fallback ready even if optional discovery exhausts the lookup budget.
  const fallback = fetchIcon(siteFaviconUrl(url)!, signal);
  const result = (
    title: string,
    candidate: IconCandidate | undefined,
    kind: 'website' | 'favicon',
  ): WebsiteIconResult => ({
    title,
    icon: candidate?.image,
    iconSource: candidate ? { kind, url: candidate.url } : undefined,
  });
  try {
    const metadata = await fetchSiteMetadata(url, signal);
    const declared = fetchSiteIcon(metadata.iconUrls ?? [], signal);
    const manifest = (async () => {
      const icons = await manifestIcons(metadata.manifestUrl, signal);
      return fetchSiteIcon(icons, signal);
    })();
    let original = bestIcon(await Promise.all([declared, manifest]));
    if (original?.highQuality) return result(metadata.title, original, 'website');
    // These are conventional website paths, not a per-domain list of replacement artwork.
    const touch = await fetchSiteIcon(
      [
        new URL('/apple-touch-icon.png', website.origin).href,
        new URL('/apple-touch-icon-precomposed.png', website.origin).href,
      ],
      signal,
    );
    original = bestIcon([original, touch]);
    if (original?.highQuality) return result(metadata.title, original, 'website');
    const favicon = await fallback;
    if (favicon?.highQuality) return result(metadata.title, favicon, 'favicon');
    const best = bestIcon([original, favicon]);
    return result(metadata.title, best, best === favicon ? 'favicon' : 'website');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
