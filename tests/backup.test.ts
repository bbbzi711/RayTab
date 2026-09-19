import { describe, expect, it } from 'vitest';
import {
  backupSummary,
  createBackup,
  parseBackup,
  restoreBackup,
} from '../src/features/backup/backup';
import { createInitialState } from '../src/storage/model';
import { createRepository } from '../src/storage/database';
import { applyCommand } from '../src/storage/operations';

describe('versioned backup', () => {
  it('backs up selected spaces and encrypts private content', async () => {
    const state = createInitialState();
    state.spaces.private.sites.push({
      id: 'secret',
      categoryId: state.spaces.private.categories[0].id,
      title: 'Secret',
      url: 'https://secret.example/',
      color: '#123456',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      changeId: 'secret-change',
      iconId: 'secret-icon',
    });
    const document = await createBackup(
      state,
      new Map([['secret-icon', new Blob(['private image'], { type: 'image/webp' })]]),
      'all',
      'private-pass',
    );
    expect(JSON.stringify(document.spaces.private)).not.toContain('secret.example');
    expect(JSON.stringify(document.spaces.private)).not.toContain('private image');
    expect(backupSummary(document)).toMatchObject({
      normal: { sites: 5 },
      private: { protected: true },
    });
    const empty = createInitialState();
    empty.spaces.private.sites = [];
    const restored = await restoreBackup(empty, document, 'replace', 'private-pass');
    expect(restored.state.spaces.private.sites[0].url).toBe('https://secret.example/');
    expect(await restored.resources.get('secret-icon')?.text()).toBe('private image');
  });

  it('exports only the selected space', async () => {
    const state = createInitialState();
    const normal = await createBackup(state, new Map(), 'normal');
    expect(normal.spaces.normal).toBeDefined();
    expect(normal.spaces.private).toBeUndefined();
    const privateOnly = await createBackup(state, new Map(), 'private');
    expect(privateOnly.spaces.normal).toBeUndefined();
    expect(privateOnly.spaces.private).toBeDefined();
  });

  it('rejects corrupt, future and wrong-password backups without mutating input', async () => {
    const state = createInitialState();
    const before = structuredClone(state);
    await expect(parseBackup('{oops')).rejects.toThrow('JSON');
    await expect(parseBackup({ format: 'raytab-backup', version: 99 })).rejects.toThrow('版本');
    const document = await createBackup(state, new Map(), 'private', 'private-pass');
    await expect(restoreBackup(state, document, 'replace', 'wrong-pass')).rejects.toThrow(
      '密码错误',
    );
    expect(state).toEqual(before);
  });

  it('restores settings, navigation data, and image resources into an empty repository', async () => {
    const source = createRepository(crypto.randomUUID());
    const initial = await source.read();
    const categoryId = initial.spaces.normal.categories[0].id;
    await source.update(
      (state) => {
        applyCommand(state, {
          type: 'save-site',
          spaceId: 'normal',
          id: 'resource-site',
          categoryId,
          site: {
            title: 'Resource site',
            url: 'https://resource.example',
            color: '#123456',
            iconId: 'resource-icon',
          },
        });
        applyCommand(state, {
          type: 'settings',
          spaceId: 'normal',
          patch: { theme: 'dark', showClock: false },
        });
      },
      new Map([['resource-icon', new Blob(['icon bytes'], { type: 'image/webp' })]]),
    );
    const snapshot = await source.snapshot();
    const document = await createBackup(snapshot.state, snapshot.resources, 'all');
    const destination = createRepository(crypto.randomUUID());
    const restored = await restoreBackup(await destination.read(), document, 'replace');
    await destination.restore(restored.state, restored.resources);

    const reopened = await destination.read();
    expect(reopened.normalSettings).toMatchObject({ theme: 'dark', showClock: false });
    expect(reopened.spaces.normal.sites).toContainEqual(
      expect.objectContaining({ id: 'resource-site', iconId: 'resource-icon' }),
    );
    expect(await (await destination.resource('resource-icon'))?.text()).toBe('icon bytes');
    await source.close();
    await destination.close();
  });

  it('rolls back a restore when a referenced resource is missing', async () => {
    const repo = createRepository(crypto.randomUUID());
    const before = await repo.read();
    const invalid = structuredClone(before);
    invalid.spaces.normal.sites[0].iconId = 'missing-icon';

    await expect(repo.restore(invalid, new Map())).rejects.toThrow('图片资源缺失');
    expect(await repo.read()).toEqual(before);
    await repo.close();
  });
});
