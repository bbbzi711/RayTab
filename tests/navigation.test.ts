import { describe, expect, it } from 'vitest';
import { createRepository } from '../src/storage/database';
import {
  createInitialState as emptyState,
  effectiveSettings,
  rayStateSchema,
  searchEngineSchema,
} from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';

function createInitialState() {
  const state = emptyState();
  const groupId = state.local.activeGroup.normal;
  applyCommand(state, {
    type: 'save-folder',
    spaceId: 'normal',
    id: 'test-folder',
    groupId,
    name: '资料',
  });
  applyCommand(state, {
    type: 'move-site',
    spaceId: 'normal',
    id: state.spaces.normal.sites[0].id,
    groupId,
    folderId: 'test-folder',
  });
  return state;
}

describe('navigation data model', () => {
  it('accepts safe search templates and requires a query placeholder', () => {
    expect(
      searchEngineSchema.safeParse({
        id: 'custom',
        name: 'Custom',
        url: 'https://example.com/?q=%s',
      }).success,
    ).toBe(true);
    expect(
      searchEngineSchema.safeParse({ id: 'bad', name: 'Bad', url: 'https://example.com/' }).success,
    ).toBe(false);
  });
  it('starts with two isolated valid spaces', () => {
    const state = createInitialState();
    expect(rayStateSchema.parse(state)).toEqual(state);
    expect(state.spaces.normal.sites.length).toBeGreaterThan(0);
    expect(state.spaces.private.sites).toHaveLength(0);
  });

  it('adds, edits, moves and deletes a site without breaking references', () => {
    const state = createInitialState();
    const spaceId = 'normal';
    const folders = state.spaces.normal.folders;
    const source = folders[0];
    const target = { id: null };
    applyCommand(state, {
      type: 'save-site',
      spaceId,
      id: 'new-site',
      groupId: state.local.activeGroup.normal,
      folderId: source.id,
      site: { title: 'Example', url: 'example.com', color: '#123456' },
    });
    const created = state.spaces.normal.sites.find((item) => item.id === 'new-site')!;
    expect(created.url).toBe('https://example.com/');
    applyCommand(state, {
      type: 'move-site',
      spaceId,
      id: created.id,
      groupId: state.local.activeGroup.normal,
      folderId: target.id,
    });
    expect(created.folderId).toBe(target.id);
    applyCommand(state, { type: 'delete-site', spaceId, id: created.id });
    expect(state.spaces.normal.sites).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    expect(state.spaces.normal.tombstones).toContainEqual(
      expect.objectContaining({ id: created.id, entity: 'site' }),
    );
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('deletes multiple sites atomically and records a tombstone for each one', () => {
    const state = createInitialState();
    const deletingIds = state.spaces.normal.sites.slice(0, 2).map((site) => site.id);
    const remainingId = state.spaces.normal.sites[2].id;

    applyCommand(state, { type: 'delete-sites', spaceId: 'normal', ids: deletingIds });

    expect(state.spaces.normal.sites.some((site) => deletingIds.includes(site.id))).toBe(false);
    expect(state.spaces.normal.sites).toContainEqual(expect.objectContaining({ id: remainingId }));
    expect(
      state.spaces.normal.tombstones
        .filter((item) => item.entity === 'site' && deletingIds.includes(item.id))
        .map((item) => item.id),
    ).toEqual(deletingIds);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('does not partially delete a batch when one site is missing', () => {
    const state = createInitialState();
    const originalIds = state.spaces.normal.sites.map((site) => site.id);

    expect(() =>
      applyCommand(state, {
        type: 'delete-sites',
        spaceId: 'normal',
        ids: [originalIds[0], 'missing-site'],
      }),
    ).toThrow('网站不存在');
    expect(state.spaces.normal.sites.map((site) => site.id)).toEqual(originalIds);
    expect(state.spaces.normal.tombstones).toEqual([]);
  });

  it('moves sites to the default folder when deleting a folder', () => {
    const state = createInitialState();
    const folder = state.spaces.normal.folders[0];
    const fallback = { id: null };
    const affectedIds = state.spaces.normal.sites
      .filter((item) => item.folderId === folder.id)
      .map((item) => item.id);
    applyCommand(state, { type: 'delete-folder', spaceId: 'normal', id: folder.id });
    expect(
      state.spaces.normal.sites
        .filter((item) => affectedIds.includes(item.id))
        .every((item) => item.folderId === fallback.id),
    ).toBe(true);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('sorts sites deterministically within and across folders', () => {
    const state = createInitialState();
    const source = state.spaces.normal.folders[0];
    const target = { id: null };
    const [first, second] = state.spaces.normal.sites;
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: second.id,
      groupId: state.local.activeGroup.normal,
      folderId: source.id,
      beforeId: first.id,
    });
    expect(
      state.spaces.normal.sites
        .filter((item) => item.folderId === source.id)
        .sort((a, b) => a.order - b.order)[0].id,
    ).toBe(second.id);
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: first.id,
      groupId: state.local.activeGroup.normal,
      folderId: target.id,
    });
    expect(first.folderId).toBe(target.id);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('moves group content before deleting it and always retains one group', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'work', name: '工作' });
    const oldGroup = state.local.activeGroup.normal;
    applyCommand(state, {
      type: 'delete-group',
      spaceId: 'normal',
      id: oldGroup,
      destinationGroupId: 'work',
    });
    expect(state.local.activeGroup.normal).toBe('work');
    expect(state.spaces.normal.sites).toHaveLength(5);
    expect(() =>
      applyCommand(state, {
        type: 'delete-group',
        spaceId: 'normal',
        id: 'work',
        destinationGroupId: 'missing',
      }),
    ).toThrow('至少保留');
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('reorders groups and records every affected order change', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'second', name: '第二页' });
    applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'third', name: '第三页' });
    const originalFirst = state.spaces.normal.groups.find((item) => item.order === 0)!;
    const previousChange = originalFirst.changeId;
    applyCommand(state, {
      type: 'move-group',
      spaceId: 'normal',
      id: 'third',
      beforeId: originalFirst.id,
    });
    const ordered = [...state.spaces.normal.groups].sort((a, b) => a.order - b.order);
    expect(ordered.map((item) => item.id)).toEqual(['third', originalFirst.id, 'second']);
    expect(originalFirst.changeId).not.toBe(previousChange);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('inherits private settings and can remove one override', () => {
    const state = createInitialState();
    applyCommand(state, {
      type: 'settings',
      spaceId: 'normal',
      patch: { theme: 'dark', showClock: false },
    });
    expect(effectiveSettings(state, 'private')).toMatchObject({ theme: 'dark', showClock: false });
    applyCommand(state, { type: 'settings', spaceId: 'private', patch: { showClock: true } });
    expect(effectiveSettings(state, 'private').showClock).toBe(true);
    applyCommand(state, { type: 'reset-private-setting', key: 'showClock' });
    expect(effectiveSettings(state, 'private').showClock).toBe(false);
  });
});

describe('repository transactions', () => {
  it('preserves URL parameters and fragments through saving, moving and reopening', async () => {
    const name = crypto.randomUUID();
    const repo = createRepository(name);
    const url = 'https://example.com/Docs%2FPage?token=AbC%2B123&tag=One&tag=two&empty=#Section-2';
    await repo.update((state) => {
      const groups = state.spaces.normal.groups;
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: 'original-url',
        groupId: groups[0].id,
        folderId: null,
        site: { title: 'Original', url, color: '#123456' },
      });
      applyCommand(state, {
        type: 'move-site',
        spaceId: 'normal',
        id: 'original-url',
        groupId: groups[0].id,
        folderId: null,
      });
    });
    await repo.close();
    const reopened = createRepository(name);
    expect(
      (await reopened.read()).spaces.normal.sites.find((site) => site.id === 'original-url')?.url,
    ).toBe(url);
    await reopened.close();
  });

  it('serializes writes from multiple tabs and rejects stale edits', async () => {
    const name = crypto.randomUUID();
    const first = createRepository(name);
    const second = createRepository(name);
    const initial = await first.read();
    const site = initial.spaces.normal.sites[0];
    await first.update((state) =>
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: site.id,
        groupId: site.groupId,
        folderId: site.folderId,
        expected: site.updatedAt,
        site: { ...site, title: 'Fresh' },
      }),
    );
    await expect(
      second.update((state) =>
        applyCommand(state, {
          type: 'save-site',
          spaceId: 'normal',
          id: site.id,
          groupId: site.groupId,
          folderId: site.folderId,
          expected: site.updatedAt,
          site: { ...site, title: 'Stale' },
        }),
      ),
    ).rejects.toThrow('另一个页面');
    expect(
      (await second.read()).spaces.normal.sites.find((item) => item.id === site.id)?.title,
    ).toBe('Fresh');
    await first.close();
    await second.close();
  });

  it('persists a complete navigation flow after closing and reopening the database', async () => {
    const name = crypto.randomUUID();
    const first = createRepository(name);
    const initial = await first.read();
    const originalGroup = initial.local.activeGroup.normal;
    await first.update((state) => {
      applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'work', name: 'Work' });
      applyCommand(state, {
        type: 'save-folder',
        spaceId: 'normal',
        id: 'research',
        groupId: 'work',
        name: 'Research',
      });
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: 'docs',
        groupId: 'work',
        folderId: 'research',
        site: { title: 'Docs', url: 'docs.example.com', color: '#123456' },
      });
      applyCommand(state, {
        type: 'move-site',
        spaceId: 'normal',
        id: 'docs',
        groupId: originalGroup,
        folderId: null,
      });
      applyCommand(state, { type: 'select-group', spaceId: 'normal', groupId: 'work' });
    });
    await first.close();

    const reopened = createRepository(name);
    const persisted = await reopened.read();
    expect(persisted.local.activeGroup.normal).toBe('work');
    expect(persisted.spaces.normal.groups).toContainEqual(expect.objectContaining({ id: 'work' }));
    expect(persisted.spaces.normal.folders).toContainEqual(
      expect.objectContaining({ id: 'research', groupId: 'work' }),
    );
    expect(persisted.spaces.normal.sites).toContainEqual(
      expect.objectContaining({ id: 'docs', url: 'https://docs.example.com/' }),
    );
    expect(rayStateSchema.safeParse(persisted).success).toBe(true);
    await reopened.close();
  });

  it('keeps a large navigation collection valid and responsive after persistence', async () => {
    const name = crypto.randomUUID();
    const repository = createRepository(name);
    const startedAt = performance.now();
    await repository.update((state) => {
      state.spaces.normal.sites = Array.from({ length: 2_000 }, (_, order) => ({
        id: `site-${order}`,
        groupId: state.local.activeGroup.normal,
        folderId: null,
        title: `Site ${order}`,
        url: `https://example.com/${order}`,
        color: '#4f7c68',
        order,
        createdAt: order,
        updatedAt: order,
        changeId: `change-${order}`,
      }));
    });
    await repository.close();

    const reopened = createRepository(name);
    const persisted = await reopened.read();
    const elapsed = performance.now() - startedAt;
    expect(persisted.spaces.normal.sites).toHaveLength(2_000);
    expect(rayStateSchema.safeParse(persisted).success).toBe(true);
    expect(elapsed).toBeLessThan(2_000);
    await reopened.close();
  });
});

it('moves a selected batch atomically and preserves their relative order and URLs', () => {
  const state = createInitialState();
  state.spaces.normal.sites[0].folderId = null;
  const original = structuredClone(state.spaces.normal.sites.slice(0, 2));
  const destination = state.spaces.normal.folders[0];
  expect(() =>
    applyCommand(state, {
      type: 'move-sites',
      spaceId: 'normal',
      ids: [original[0].id, 'missing'],
      groupId: state.local.activeGroup.normal,
      folderId: destination.id,
    }),
  ).toThrow('网站不存在');
  expect(state.spaces.normal.sites.slice(0, 2)).toEqual(original);
  applyCommand(state, {
    type: 'move-sites',
    spaceId: 'normal',
    ids: original.map((s) => s.id),
    groupId: state.local.activeGroup.normal,
    folderId: destination.id,
  });
  expect(
    state.spaces.normal.sites
      .filter((s) => s.folderId === destination.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.url),
  ).toEqual(original.map((s) => s.url));
});

it('preserves folders when deleting a group and appends its loose links', () => {
  const state = createInitialState();
  const home = state.local.activeGroup.normal;
  const folders = state.spaces.normal.folders.map((c) => c.id);
  const links = state.spaces.normal.sites.map((s) => ({
    id: s.id,
    url: s.url,
    folderId: s.folderId,
  }));
  applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'second', name: 'Second' });
  applyCommand(state, {
    type: 'delete-group',
    spaceId: 'normal',
    id: home,
    destinationGroupId: 'second',
  });
  expect(state.spaces.normal.folders.map((c) => c.id)).toEqual(folders);
  expect(state.spaces.normal.folders.every((c) => c.groupId === 'second')).toBe(true);
  expect(
    state.spaces.normal.sites.map((s) => ({ id: s.id, url: s.url, folderId: s.folderId })),
  ).toEqual(links);
  expect(rayStateSchema.safeParse(state).success).toBe(true);
});
