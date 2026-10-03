import catalog from './assets/brand-index.json';
import { z } from 'zod';

const domains = new Map<string, typeof catalog>();
for (const entry of catalog)
  domains.set(entry.hostname, [...(domains.get(entry.hostname) ?? []), entry]);

// Some products use a different application domain from their catalog website.
const applicationDomains: Record<string, string> = {
  'chatgpt.com': 'openai.com',
  'chat.openai.com': 'openai.com',
  'chat.deepseek.com': 'deepseek.com',
  'douyin.com': 'tiktok.com',
  'm.jd.com': 'jd.com',
  'm.douban.com': 'douban.com',
  'kyfw.12306.cn': '12306.cn',
};

export function findCatalogIcon(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    const domain = applicationDomains[hostname] ?? hostname;
    // Do not turn a product subdomain (e.g. mail.google.com) into its parent logo.
    const entry = (domains.get(hostname) ?? domains.get(domain))?.find(
      (item) =>
        (item.hostname === hostname || item.pathname === '/') &&
        (item.pathname === '/' ||
          url.pathname === item.pathname ||
          url.pathname.startsWith(`${item.pathname}/`)),
    );
    if (!entry) return undefined;
    return {
      title: entry.title,
      hostname: entry.hostname,
      pathname: entry.pathname,
      tile: entry.tile,
      cover: entry.cover,
      light: `/brand-icons/${entry.light}`,
      dark: `/brand-icons/${entry.dark ?? entry.light}`,
    };
  } catch {
    return undefined;
  }
}

const CACHE_KEY = 'raytab-public-brand-catalog';
const FRESH_FOR = 7 * 24 * 60 * 60 * 1_000;
const RETRY_AFTER = 60 * 60 * 1_000;
const apiEntry = z.object({
  title: z.string().min(1).max(160),
  url: z.string().max(2_048),
  route: z.union([
    z.string().max(2_048),
    z.object({ light: z.string().max(2_048), dark: z.string().max(2_048) }),
  ]),
});
const apiCatalog = z.array(apiEntry).min(1).max(5_000);
const cacheSchema = z.object({
  fetchedAt: z.number().nonnegative(),
  attemptedAt: z.number().nonnegative(),
  entries: z.array(apiEntry).max(5_000),
});
type PublicCatalogCache = z.infer<typeof cacheSchema>;
let memory: PublicCatalogCache | undefined;
let reading: Promise<PublicCatalogCache> | undefined;
let refreshing: Promise<PublicCatalogCache> | undefined;

async function readCache() {
  if (memory) return memory;
  if (reading) return reading;
  reading = (async () => {
    if (typeof browser !== 'undefined' && browser.storage?.local) {
      try {
        const stored: unknown = (await browser.storage.local.get(CACHE_KEY))[CACHE_KEY];
        const parsed = cacheSchema.safeParse(stored);
        if (parsed.success) memory = parsed.data;
      } catch {
        console.warn('Unable to read the public brand catalog cache.');
      }
    }
    return (memory ??= { fetchedAt: 0, attemptedAt: 0, entries: [] });
  })();
  return reading;
}

async function persistCache(cache: PublicCatalogCache) {
  if (typeof browser === 'undefined' || !browser.storage?.local) return;
  try {
    // This record is a public catalog, with no browsing history or user website list.
    await browser.storage.local.set({ [CACHE_KEY]: cache });
  } catch {
    console.warn('Unable to persist the public brand catalog cache; using memory for this page.');
  }
}

/** Called only by an explicit normal-space icon lookup, never by homepage rendering. */
export async function refreshBrandCatalog() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const cached = await readCache();
    const now = Date.now();
    if (
      (cached.entries.length && now - cached.fetchedAt < FRESH_FOR) ||
      (cached.attemptedAt && now - cached.attemptedAt < RETRY_AFTER)
    )
      return cached;
    memory = { ...cached, attemptedAt: now };
    await persistCache(memory);
    try {
      const response = await fetch('https://api.svgl.app', {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.timeout(2_500),
      });
      if (response.ok) {
        const entries = apiCatalog.parse(await response.json());
        memory = { entries, fetchedAt: now, attemptedAt: now };
        await persistCache(memory);
      }
    } catch {
      // The checked-in catalog and direct website lookup remain usable offline.
    }
    return memory;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = undefined;
  }
}

function publicAsset(raw: string) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://svgl.app' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.endsWith('.svg')
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Match in memory; the catalog request never includes a domain, URL or search term. */
export async function findPublicCatalogIcon(rawUrl: string) {
  const catalog = await refreshBrandCatalog();
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const matches = catalog.entries.flatMap((entry) => {
    try {
      const site = new URL(entry.url);
      const domain = site.hostname.replace(/^www\./, '').toLowerCase();
      const pathname = site.pathname.replace(/\/$/, '') || '/';
      const route = typeof entry.route === 'string' ? entry.route : entry.route.light;
      const light = publicAsset(route);
      if (
        !light ||
        site.protocol !== 'https:' ||
        site.username ||
        site.password ||
        (domain !== host && domain !== applicationDomains[host]) ||
        (domain !== host && pathname !== '/') ||
        (pathname !== '/' && url.pathname !== pathname && !url.pathname.startsWith(`${pathname}/`))
      )
        return [];
      return [{ title: entry.title, light, pathname, exactDomain: domain === host }];
    } catch {
      return [];
    }
  });
  return matches.sort(
    (a, b) =>
      Number(b.exactDomain) - Number(a.exactDomain) || b.pathname.length - a.pathname.length,
  )[0];
}
