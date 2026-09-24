import { normalizeUrl } from '@/storage/model';

export type SiteMetadata = { title: string; iconUrl?: string };

const KNOWN_DOMAINS: Record<string, string> = {
  'github.com': 'GitHub',
  'google.com': 'Google',
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
  const icon = document
    .querySelector('link[rel~="icon" i], link[rel="apple-touch-icon" i]')
    ?.getAttribute('href');
  return {
    title: title.slice(0, 80),
    iconUrl: icon
      ? new URL(icon, pageUrl).href
      : `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(pageUrl)}&size=128`,
  };
}

export async function fetchSiteMetadata(rawUrl: string): Promise<SiteMetadata> {
  const url = normalizeUrl(rawUrl);
  const parsedUrl = new URL(url);
  const origin = `${parsedUrl.origin}/*`;

  let hasPermission = false;
  if (typeof browser !== 'undefined' && browser.permissions?.contains) {
    try {
      hasPermission = await browser.permissions.contains({ origins: [origin] });
    } catch {
      hasPermission = false;
    }
  }

  // If in extension environment without host permission, request it gracefully
  if (!hasPermission && typeof browser !== 'undefined' && browser.permissions?.request) {
    try {
      hasPermission = await browser.permissions.request({ origins: [origin] });
    } catch {
      hasPermission = false;
    }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        return extractSiteMetadata(await response.text(), response.url || url);
      }
    }
  } catch {
    // If fetch failed (CORS, network error, or offline), gracefully fallback without throwing error
  } finally {
    window.clearTimeout(timeout);
  }

  // Graceful fallback: high-res favicon + smart domain title
  return {
    title: formatDomainTitle(parsedUrl.hostname),
    iconUrl: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=128`,
  };
}

export async function fetchSiteIcon(iconUrl?: string, pageUrl?: string) {
  const targetUrl =
    iconUrl ||
    (pageUrl
      ? `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(pageUrl)}&size=128`
      : undefined);
  if (!targetUrl) return undefined;

  const tryFetch = async (src: string): Promise<Blob | undefined> => {
    try {
      const response = await fetch(src, { credentials: 'omit' });
      if (!response.ok) return undefined;
      const blob = await response.blob();
      const type = blob.type.toLowerCase();
      const isImage =
        type.startsWith('image/') ||
        ['image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'].includes(type) ||
        /\.(ico|png|jpe?g|webp|svg)(\?.*)?$/i.test(src);
      if (!isImage && blob.size === 0) return undefined;
      const normalizedType =
        type && type !== 'application/octet-stream'
          ? type
          : /\.(ico)(\?.*)?$/i.test(src)
            ? 'image/x-icon'
            : /\.(svg)(\?.*)?$/i.test(src)
              ? 'image/svg+xml'
              : blob.type || 'image/png';
      return normalizedType === blob.type ? blob : new Blob([blob], { type: normalizedType });
    } catch {
      return undefined;
    }
  };

  const primaryResult = await tryFetch(targetUrl);
  if (primaryResult) return primaryResult;

  // If primary icon failed (e.g. CORS on original site icon), fallback to Google Favicon service
  if (pageUrl && !targetUrl.includes('gstatic.com')) {
    const fallbackUrl = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(pageUrl)}&size=128`;
    return await tryFetch(fallbackUrl);
  }

  return undefined;
}
