import { normalizeUrl } from '@/storage/model';

export type SiteMetadata = { title: string; iconUrl?: string };

export function extractSiteMetadata(html: string, pageUrl: string): SiteMetadata {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title =
    document.querySelector('meta[property="og:site_name" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('meta[name="application-name" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('meta[property="og:title" i]')?.getAttribute('content')?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    new URL(pageUrl).hostname.replace(/^www\./i, '');
  const icon = document
    .querySelector('link[rel~="icon" i], link[rel="apple-touch-icon" i]')
    ?.getAttribute('href');
  return {
    title: title.slice(0, 80),
    iconUrl: icon ? new URL(icon, pageUrl).href : new URL('/favicon.ico', pageUrl).href,
  };
}

export async function fetchSiteMetadata(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  const origin = `${new URL(url).origin}/*`;
  const granted = await browser.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('需要允许访问该网站才能自动获取信息');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('无法读取网站信息');
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) throw new Error('该网址不是网页');
      return extractSiteMetadata(await response.text(), response.url || url);
    } catch (error) {
      if (error instanceof Error && ['无法读取网站信息', '该网址不是网页'].includes(error.message))
        throw error;
      throw new Error('无法读取网站信息');
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchSiteIcon(iconUrl?: string) {
  if (!iconUrl) return undefined;
  try {
    const response = await fetch(iconUrl, { credentials: 'omit' });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const type = blob.type.toLowerCase();
    const isImage =
      type.startsWith('image/') ||
      ['image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'].includes(type) ||
      /\.(ico|png|jpe?g|webp|svg)(\?.*)?$/i.test(iconUrl);
    if (!isImage) return undefined;
    const normalizedType =
      type && type !== 'application/octet-stream'
        ? type
        : /\.(ico)(\?.*)?$/i.test(iconUrl)
          ? 'image/x-icon'
          : /\.(svg)(\?.*)?$/i.test(iconUrl)
            ? 'image/svg+xml'
            : blob.type;
    return normalizedType === blob.type ? blob : new Blob([blob], { type: normalizedType });
  } catch {
    return undefined;
  }
}
