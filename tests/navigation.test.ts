import { describe, expect, it } from 'vitest';
import { createRepository } from '../src/storage/database';
import {
  createInitialState,
  effectiveSettings,
  rayStateSchema,
  searchEngineSchema,
} from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';

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
  it('starts with two isolated valid spaces and one default category per desktop', () => {
    const state = createInitialState();
    expect(rayStateSchema.parse(state)).toEqual(state);
    expect(state.spaces.normal.sites.length).toBeGreaterThan(0);
    expect(state.spaces.private.sites).toHaveLength(0);
    for (const space of Object.values(state.spaces))
      for (const desktop of space.desktops)
        expect(
          space.categories.filter((item) => item.desktopId === desktop.id && item.isDefault),
        ).toHaveLength(1);
  });

  it('adds, edits, moves and deletes a site without breaking references', () => {
    const state = createInitialState();
    const spaceId = 'normal';
    const categories = state.spaces.normal.categories;
    const source = categories.find((item) => !item.isDefault)!;
    const target = categories.find((item) => item.isDefault)!;
    applyCommand(state, {
      type: 'save-site',
      spaceId,
      id: 'new-site',
      categoryId: source.id,
      site: { title: 'Example', url: 'example.com', color: '#123456' },
    });
    const created = state.spaces.normal.sites.find((item) => item.id === 'new-site')!;
    expect(created.url).toBe('https://example.com/');
    applyCommand(state, { type: 'move-site', spaceId, id: created.id, categoryId: target.id });
    expect(created.categoryId).toBe(target.id);
    applyCommand(state, { type: 'delete-site', spaceId, id: created.id });
    expect(state.spaces.normal.sites).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    expect(state.spaces.normal.tombstones).toContainEqual(
      expect.objectContaining({ id: created.id, entity: 'site' }),
    );
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('moves sites to the default category when deleting a category', () => {
    const state = createInitialState();
    const category = state.spaces.normal.categories.find((item) => !item.isDefault)!;
    const fallback = state.spaces.normal.categories.find((item) => item.isDefault)!;
    const affectedIds = state.spaces.normal.sites
      .filter((item) => item.categoryId === category.id)
      .map((item) => item.id);
    applyCommand(state, { type: 'delete-category', spaceId: 'normal', id: category.id });
    expect(
      state.spaces.normal.sites
        .filter((item) => affectedIds.includes(item.id))
        .every((item) => item.categoryId === fallback.id),
    ).toBe(true);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('sorts sites deterministically within and across categories', () => {
    const state = createInitialState();
    const source = state.spaces.normal.categories.find((item) => !item.isDefault)!;
    const target = state.spaces.normal.categories.find((item) => item.isDefault)!;
    const [first, second] = state.spaces.normal.sites;
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: second.id,
      categoryId: source.id,
      beforeId: first.id,
    });
    expect(
      state.spaces.normal.sites
        .filter((item) => item.categoryId === source.id)
        .sort((a, b) => a.order - b.order)[0].id,
    ).toBe(second.id);
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: first.id,
      categoryId: target.id,
    });
    expect(first.categoryId).toBe(target.id);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('moves desktop content before deleting it and always retains one desktop', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'save-desktop', spaceId: 'normal', id: 'work', name: '工作' });
    const oldDesktop = state.local.activeDesktop.normal;
    applyCommand(state, {
      type: 'delete-desktop',
      spaceId: 'normal',
      id: oldDesktop,
      destinationDesktopId: 'work',
    });
    expect(state.local.activeDesktop.normal).toBe('work');
    expect(state.spaces.normal.sites).toHaveLength(5);
    expect(() =>
      applyCommand(state, {
        type: 'delete-desktop',
        spaceId: 'normal',
        id: 'work',
        destinationDesktopId: 'missing',
      }),
    ).toThrow('至少保留');
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('reorders desktops and records every affected order change', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'save-desktop', spaceId: 'normal', id: 'second', name: '第二页' });
    applyCommand(state, { type: 'save-desktop', spaceId: 'normal', id: 'third', name: '第三页' });
    const originalFirst = state.spaces.normal.desktops.find((item) => item.order === 0)!;
    const previousChange = originalFirst.changeId;
    applyCommand(state, {
      type: 'move-desktop',
      spaceId: 'normal',
      id: 'third',
      beforeId: originalFirst.id,
    });
    const ordered = [...state.spaces.normal.desktops].sort((a, b) => a.order - b.order);
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
        categoryId: site.categoryId,
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
          categoryId: site.categoryId,
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
    const originalDesktop = initial.local.activeDesktop.normal;
    await first.update((state) => {
      applyCommand(state, { type: 'save-desktop', spaceId: 'normal', id: 'work', name: 'Work' });
      applyCommand(state, {
        type: 'save-category',
        spaceId: 'normal',
        id: 'research',
        desktopId: 'work',
        name: 'Research',
        color: '#123456',
        showInAll: true,
      });
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: 'docs',
        categoryId: 'research',
        site: { title: 'Docs', url: 'docs.example.com', color: '#123456' },
      });
      applyCommand(state, {
        type: 'move-site',
        spaceId: 'normal',
        id: 'docs',
        categoryId: state.spaces.normal.categories.find(
          (item) => item.desktopId === originalDesktop && item.isDefault,
        )!.id,
      });
      applyCommand(state, { type: 'select-desktop', spaceId: 'normal', desktopId: 'work' });
    });
    await first.close();

    const reopened = createRepository(name);
    const persisted = await reopened.read();
    expect(persisted.local.activeDesktop.normal).toBe('work');
    expect(persisted.spaces.normal.desktops).toContainEqual(
      expect.objectContaining({ id: 'work' }),
    );
    expect(persisted.spaces.normal.categories).toContainEqual(
      expect.objectContaining({ id: 'research', desktopId: 'work' }),
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
      const category = state.spaces.normal.categories.find((item) => !item.isDefault)!;
      state.spaces.normal.sites = Array.from({ length: 2_000 }, (_, order) => ({
        id: `site-${order}`,
        categoryId: category.id,
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
