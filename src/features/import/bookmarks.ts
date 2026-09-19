import { normalizeUrl } from '@/storage/model';

export type BookmarkCandidate = {
  title: string;
  url: string;
  category: string;
  path: string[];
};

export function parseBookmarkHtml(html: string): BookmarkCandidate[] {
  if (!/<a\s/i.test(html)) throw new Error('没有找到可导入的书签');
  const tokens =
    html.match(/<DT>\s*<H3[^>]*>[\s\S]*?<\/H3>|<DT>\s*<A\s[^>]*>[\s\S]*?<\/A>|<\/DL>/gi) ?? [];
  const stack: string[] = [];
  let pendingFolder: string | undefined;
  const result: BookmarkCandidate[] = [];
  for (const token of tokens) {
    const folder = token.match(/<H3[^>]*>([\s\S]*?)<\/H3>/i);
    if (folder) {
      pendingFolder = text(folder[1]);
      stack.push(pendingFolder);
      continue;
    }
    if (/<\/DL>/i.test(token)) {
      if (stack.length) stack.pop();
      pendingFolder = undefined;
      continue;
    }
    const link = token.match(/<A\s[^>]*HREF=["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>/i);
    if (!link) continue;
    try {
      result.push({
        title: text(link[2]) || new URL(link[1]).hostname,
        url: normalizeUrl(decodeEntities(link[1])),
        category: stack.at(-1) || '导入书签',
        path: [...stack],
      });
    } catch {
      /* Ignore browser-internal and malformed URLs. */
    }
  }
  if (!result.length) throw new Error('没有找到可导入的 http 或 https 书签');
  return result;
}

export async function readBrowserBookmarks(): Promise<BookmarkCandidate[]> {
  const allowed = await browser.permissions.request({ permissions: ['bookmarks'] });
  if (!allowed) throw new Error('未授予读取浏览器书签的权限');
  const roots = await browser.bookmarks.getTree();
  const result: BookmarkCandidate[] = [];
  const visit = (nodes: Browser.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        try {
          result.push({
            title: node.title || new URL(node.url).hostname,
            url: normalizeUrl(node.url),
            category: path.at(-1) || '浏览器书签',
            path,
          });
        } catch {
          /* Ignore unsupported URLs. */
        }
      }
      if (node.children) visit(node.children, node.title ? [...path, node.title] : path);
    }
  };
  visit(roots, []);
  return result;
}

export function deduplicateBookmarks(
  candidates: BookmarkCandidate[],
  existingUrls: string[],
  mode: 'skip-url' | 'keep-all',
) {
  if (mode === 'keep-all') return candidates;
  const seen = new Set(existingUrls.map(canonicalUrl));
  return candidates.filter((item) => {
    const key = canonicalUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  return url.href.replace(/\/$/, '').toLowerCase();
}
function text(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, '')).trim();
}
function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
