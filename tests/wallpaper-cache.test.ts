import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { openRayDatabase } from '../src/storage/connection';
import { createRepository } from '../src/storage/database';
import { createInitialState } from '../src/storage/model';

describe('local wallpaper cache', () => {
  it('adds a disposable cache without rewriting saved navigation, image bytes or encrypted vaults', async () => {
    const name = crypto.randomUUID();
    const before = createInitialState();
    const old = await openDB(name, 2, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault']) db.createObjectStore(store);
      },
    });
    await old.put('state', before, 'current');
    await old.put('resources', new Blob(['original'], { type: 'image/png' }), 'upload');
    await old.put('vault', { ciphertext: 'opaque encrypted fixture' }, 'private');
    old.close();
    const db = await openRayDatabase(name);
    expect(db.version).toBe(3);
    expect(await db.get('state', 'current')).toEqual(before);
    expect(await (await db.get('resources', 'upload'))?.text()).toBe('original');
    expect(await db.get('vault', 'private')).toEqual({ ciphertext: 'opaque encrypted fixture' });
    await db.put(
      'wallpapers',
      {
        source: 'https://example.com/wallpaper.png',
        color: '#aabbcc',
        blob: new Blob(['cache']),
        fetchedAt: 1,
      },
      'current',
    );
    db.close();
    const reopened = await openRayDatabase(name);
    expect(await (await reopened.get('wallpapers', 'current'))?.blob?.text()).toBe('cache');
    reopened.close();
  });

  it('keeps remote cache separate from user resources, exports, and resource pruning', async () => {
    const name = crypto.randomUUID();
    const repository = createRepository(name);
    await repository.read();
    const db = await openRayDatabase(name);
    await db.put(
      'wallpapers',
      { source: 'remote', color: '#aabbcc', blob: new Blob(['cache']), fetchedAt: 1 },
      'current',
    );
    await repository.update((draft) => {
      draft.normalSettings.showClock = false;
    });
    expect((await repository.snapshot('normal')).resources.size).toBe(0);
    expect(await (await db.get('wallpapers', 'current'))?.blob?.text()).toBe('cache');
    db.close();
    await repository.close();
  });
});
