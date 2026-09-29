import { describe, expect, it, vi } from 'vitest';
import { decryptJson, encryptJson, encryptedEnvelopeSchema } from '../src/security/crypto';
import { createRepository } from '../src/storage/database';
import { applyCommand } from '../src/storage/operations';

describe('private-space encryption', () => {
  it('round-trips structured data without storing plaintext', async () => {
    const value = { title: '私密网站', url: 'https://private.example', bytes: [1, 2, 3] };
    const encrypted = await encryptJson(value, 'correct horse');
    expect(encryptedEnvelopeSchema.safeParse(encrypted).success).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain(value.title);
    await expect(decryptJson(encrypted, 'correct horse')).resolves.toEqual(value);
  });

  it('rejects weak and incorrect passwords', async () => {
    await expect(encryptJson({}, '123')).rejects.toThrow('6 个字符');
    const encrypted = await encryptJson({ secret: true }, 'right-password');
    await expect(decryptJson(encrypted, 'wrong-password')).rejects.toThrow('密码错误');
  });
});

describe('private vault repository', () => {
  it('cancels a pending unlock when the user locks before decryption finishes', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.read();
    await repo.protectPrivate('vault-password');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const decrypting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return decrypt(...args);
    });
    try {
      const unlocking = repo.unlockPrivate('vault-password');
      const rejected = expect(unlocking).rejects.toThrow('私密空间状态已变化');
      await decrypting;
      await repo.lockPrivate();
      release();
      await rejected;
      expect((await repo.read()).privateSecurity.locked).toBe(true);
    } finally {
      release();
      spy.mockRestore();
      await repo.close();
    }
  });

  it.each(['protect', 'change', 'remove'] as const)(
    'rejects a stale %s password operation without overwriting another page',
    async (operation) => {
      const name = crypto.randomUUID();
      const repo = createRepository(name);
      const other = createRepository(name);
      await repo.read();
      if (operation !== 'protect') {
        await repo.protectPrivate('vault-password');
        await other.unlockPrivate('vault-password');
      }
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const working = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const method = operation === 'remove' ? 'decrypt' : 'encrypt';
      const original = crypto.subtle[method].bind(crypto.subtle);
      const spy = vi.spyOn(crypto.subtle, method).mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return original(...args);
      });
      try {
        const changing =
          operation === 'protect'
            ? repo.protectPrivate('vault-password')
            : operation === 'change'
              ? repo.changePrivatePassword('vault-password', 'next-password')
              : repo.removePrivatePassword('vault-password');
        const rejected = expect(changing).rejects.toThrow('另一个页面');
        await working;
        const saved = await other.update((state) => {
          if (operation === 'protect') state.normalSettings.showClock = false;
          else state.privateSettingOverrides.showClock = false;
        });
        release();
        await rejected;
        const actual =
          operation === 'protect' ? await repo.read() : await repo.unlockPrivate('vault-password');
        expect(actual.revision).toBe(saved.revision);
        expect(actual.privateSecurity.protected).toBe(operation !== 'protect');
        expect(actual.normalSettings).toEqual(saved.normalSettings);
        expect(actual.privateSettingOverrides).toEqual(saved.privateSettingOverrides);
      } finally {
        release();
        spy.mockRestore();
        await repo.close();
        await other.close();
      }
    },
  );

  it('refreshes an unlocked session before saving edits from another page', async () => {
    const name = crypto.randomUUID();
    const repo = createRepository(name);
    const other = createRepository(name);
    await repo.read();
    await repo.protectPrivate('vault-password');
    await repo.unlockPrivate('vault-password');
    await other.unlockPrivate('vault-password');
    await other.update((state) => {
      state.privateSettingOverrides.showClock = false;
    });
    await repo.update((state) => {
      state.normalSettings.showClock = false;
    });
    await repo.lockPrivate();
    expect((await repo.unlockPrivate('vault-password')).privateSettingOverrides.showClock).toBe(
      false,
    );
    await repo.close();
    await other.close();
  });

  it('locks an old session after another page changes the password', async () => {
    const name = crypto.randomUUID();
    const repo = createRepository(name);
    const other = createRepository(name);
    await repo.read();
    await repo.protectPrivate('vault-password');
    const before = await repo.unlockPrivate('vault-password');
    await other.changePrivatePassword('vault-password', 'next-password');
    expect((await repo.read()).privateSecurity.locked).toBe(true);
    await expect(
      repo.update((state) => {
        state.privateSettingOverrides.showClock = false;
      }),
    ).rejects.toThrow('请先解锁');
    await repo.update((state) => {
      state.normalSettings.showClock = false;
    });
    await expect(repo.unlockPrivate('vault-password')).rejects.toThrow('密码错误');
    expect((await repo.unlockPrivate('next-password')).privateSettingOverrides).toEqual(
      before.privateSettingOverrides,
    );
    await repo.close();
    await other.close();
  });

  it('does not unlock the vault when an in-flight save finishes after locking', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.read();
    await repo.protectPrivate('vault-password');
    const before = await repo.unlockPrivate('vault-password');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encrypting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return encrypt(...args);
    });
    try {
      const saving = repo.update((state) => {
        state.privateSettingOverrides.showClock = false;
      });
      const rejected = expect(saving).rejects.toThrow('私密空间状态已变化');
      await encrypting;
      await repo.lockPrivate();
      release();
      await rejected;
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      expect((await repo.unlockPrivate('vault-password')).privateSettingOverrides).toEqual(
        before.privateSettingOverrides,
      );
    } finally {
      release();
      spy.mockRestore();
      await repo.close();
    }
  });

  it('keeps the unlocked session unchanged when saving a missing image fails', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.read();
    await repo.protectPrivate('vault-password');
    const before = await repo.unlockPrivate('vault-password');

    await expect(
      repo.update((state) =>
        applyCommand(state, {
          type: 'save-site',
          spaceId: 'private',
          id: 'unsaved-site',
          groupId: before.spaces.private.groups[0].id,
          folderId: null,
          site: {
            title: 'Unsaved',
            url: 'https://example.com/',
            color: '#123456',
            iconId: 'missing-image',
          },
        }),
      ),
    ).rejects.toThrow('私密空间图片缺失');

    expect(await repo.read()).toEqual(before);
    await repo.lockPrivate();
    expect((await repo.unlockPrivate('vault-password')).spaces.private).toEqual(
      before.spaces.private,
    );
    await repo.close();
  });

  it('removes private plaintext and resources while locked, then restores them in memory', async () => {
    const repo = createRepository(crypto.randomUUID());
    const initial = await repo.read();
    const groupId = initial.spaces.private.groups[0].id;
    await repo.update(
      (state) =>
        applyCommand(state, {
          type: 'save-site',
          spaceId: 'private',
          id: 'private-site',
          groupId,
          folderId: null,
          site: {
            title: 'Private',
            url: 'https://private.example',
            color: '#123456',
            iconId: 'private-icon',
          },
        }),
      new Map([['private-icon', new Blob(['secret image'], { type: 'image/webp' })]]),
    );
    await repo.protectPrivate('vault-password');
    const locked = await repo.read();
    expect(locked.privateSecurity).toEqual({ protected: true, locked: true });
    expect(locked.spaces.private.sites).toHaveLength(0);
    expect(await repo.resource('private-icon')).toBeUndefined();
    await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow('密码错误');
    const unlocked = await repo.unlockPrivate('vault-password');
    expect(unlocked.spaces.private.sites[0].url).toBe('https://private.example/');
    expect(await (await repo.resource('private-icon'))?.text()).toBe('secret image');
    await repo.update((state) => applyCommand(state, { type: 'switch-space', spaceId: 'private' }));
    expect((await repo.read()).local.activeSpace).toBe('private');
    await repo.lockPrivate();
    expect((await repo.read()).spaces.private.sites).toHaveLength(0);
    const restored = await repo.removePrivatePassword('vault-password');
    expect(restored.privateSecurity.protected).toBe(false);
    expect(restored.spaces.private.sites[0].title).toBe('Private');
    await repo.close();
  });

  it('changes the password, locks the vault, and removes protection with the new password', async () => {
    const repo = createRepository(crypto.randomUUID());
    const initial = await repo.read();
    await repo.update((state) =>
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'private',
        id: 'protected-site',
        groupId: initial.spaces.private.groups[0].id,
        folderId: null,
        site: { title: 'Protected', url: 'https://protected.example', color: '#123456' },
      }),
    );
    const beforeProtection = await repo.read();
    const protectedState = await repo.protectPrivate('first-password');
    expect(protectedState.revision).toBe(beforeProtection.revision + 1);
    await repo.changePrivatePassword('first-password', 'second-password');
    expect((await repo.read()).revision).toBe(protectedState.revision + 1);
    await expect(repo.unlockPrivate('first-password')).rejects.toThrow('密码错误');
    await expect(repo.unlockPrivate('second-password')).resolves.toMatchObject({
      privateSecurity: { protected: true, locked: false },
    });
    await repo.lockPrivate();
    await expect(repo.removePrivatePassword('first-password')).rejects.toThrow('密码错误');
    const unprotected = await repo.removePrivatePassword('second-password');
    expect(unprotected.revision).toBe(protectedState.revision + 2);
    expect(unprotected.privateSecurity).toEqual({ protected: false, locked: false });
    expect(unprotected.spaces.private.sites).toContainEqual(
      expect.objectContaining({ id: 'protected-site' }),
    );
    await repo.close();
  });
});
