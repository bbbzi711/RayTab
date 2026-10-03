import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deduplicateBookmarks,
  parseBookmarkHtml,
  readBrowserBookmarks,
} from '../src/features/import/bookmarks';
import { createInitialState, rayStateSchema } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';

describe('bookmark import', () => {
  afterEach(() => vi.unstubAllGlobals());
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
    <DT><H3>开发</H3><DL><p>
      <DT><A HREF="https://github.com">GitHub</A>
      <DT><A HREF="javascript:alert(1)">Unsafe</A>
    </DL><p>
    <DT><A HREF="https://example.com/path">Example</A>
  </DL>`;

  it('extracts folders and ignores unsupported links', () => {
    expect(parseBookmarkHtml(html)).toEqual([
      { title: 'GitHub', url: 'https://github.com/', folder: '开发', path: ['开发'] },
      { title: 'Example', url: 'https://example.com/path', folder: undefined, path: [] },
    ]);
  });

  it('deduplicates canonical URLs while preserving the first item', () => {
    const items = parseBookmarkHtml(html);
    expect(
      deduplicateBookmarks(items, ['https://GITHUB.com:443/'], 'skip-url').map(
        (item) => item.title,
      ),
    ).toEqual(['Example']);
    expect(deduplicateBookmarks(items, [], 'keep-all')).toHaveLength(2);
  });

  it('reports empty and unsupported bookmark files clearly', () => {
    expect(() => parseBookmarkHtml('<!doctype html><p>empty</p>')).toThrow(
      'messages.noImportableBookmarksWereFound',
    );
    expect(() =>
      parseBookmarkHtml('<DL><DT><A HREF="chrome://settings">Settings</A></DL>'),
    ).toThrow('messages.noImportableHttpOrHttpsBookmarksWereFound');
  });

  it('requests bookmark permission only when browser import is used', async () => {
    const getTree = vi.fn();
    vi.stubGlobal('browser', {
      permissions: { request: vi.fn().mockResolvedValue(false) },
      bookmarks: { getTree },
    });
    await expect(readBrowserBookmarks()).rejects.toThrow(
      'messages.browserBookmarkAccessWasNotGranted',
    );
    expect(getTree).not.toHaveBeenCalled();
  });

  it('reads browser bookmarks after permission is granted', async () => {
    vi.stubGlobal('browser', {
      permissions: { request: vi.fn().mockResolvedValue(true) },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([
          {
            title: '',
            children: [{ title: 'Docs', url: 'https://example.com/docs' }],
          },
        ]),
      },
    });
    await expect(readBrowserBookmarks()).resolves.toEqual([
      {
        title: 'Docs',
        url: 'https://example.com/docs',
        folder: undefined,
        path: [],
      },
    ]);
  });

  it('removes duplicates from the file as well as existing navigation', () => {
    const duplicate = {
      title: 'Duplicate',
      url: 'https://example.com/path',
      folder: 'Other',
      path: ['Other'],
    };
    expect(
      deduplicateBookmarks([...parseBookmarkHtml(html), duplicate], [], 'skip-url'),
    ).toHaveLength(2);
  });

  it('keeps distinct paths, queries and fragments when skipping duplicate URLs', () => {
    const urls = [
      'https://example.com/Docs?token=AbC#first',
      'https://example.com/docs?token=AbC#first',
      'https://example.com/Docs?token=abc#first',
      'https://example.com/Docs?token=AbC#second',
      'https://example.com/Docs/?token=AbC#first',
      'https://example.com/Docs?token=AbC#first',
    ];
    const items = urls.map((url) => ({ title: 'Page', url, folder: 'Links', path: [] }));
    expect(deduplicateBookmarks(items, [], 'skip-url').map((item) => item.url)).toEqual(
      urls.slice(0, 5),
    );
  });

  it('imports nested bookmark results into the selected desktop with valid references', () => {
    const state = createInitialState();
    applyCommand(state, {
      type: 'save-group',
      spaceId: 'normal',
      id: 'imports',
      name: 'Imports',
    });
    applyCommand(state, {
      type: 'import-bookmarks',
      spaceId: 'normal',
      groupId: 'imports',
      items: parseBookmarkHtml(html),
    });

    const importedCategories = state.spaces.normal.folders.filter(
      (item) => item.groupId === 'imports',
    );
    expect(importedCategories.map((item) => item.name).sort()).toEqual(['开发']);
    expect(state.spaces.normal.sites.filter((site) => site.groupId === 'imports')).toHaveLength(2);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });
});
