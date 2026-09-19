import { describe, expect, it } from 'vitest';
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
  it('removes private plaintext and resources while locked, then restores them in memory', async () => {
    const repo = createRepository(crypto.randomUUID());
    const initial = await repo.read();
    const categoryId = initial.spaces.private.categories[0].id;
    await repo.update(
      (state) =>
        applyCommand(state, {
          type: 'save-site',
          spaceId: 'private',
          id: 'private-site',
          categoryId,
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
        categoryId: initial.spaces.private.categories[0].id,
        site: { title: 'Protected', url: 'https://protected.example', color: '#123456' },
      }),
    );
    await repo.protectPrivate('first-password');
    await repo.changePrivatePassword('first-password', 'second-password');
    await expect(repo.unlockPrivate('first-password')).rejects.toThrow('密码错误');
    await expect(repo.unlockPrivate('second-password')).resolves.toMatchObject({
      privateSecurity: { protected: true, locked: false },
    });
    await repo.lockPrivate();
    await expect(repo.removePrivatePassword('first-password')).rejects.toThrow('密码错误');
    const unprotected = await repo.removePrivatePassword('second-password');
    expect(unprotected.privateSecurity).toEqual({ protected: false, locked: false });
    expect(unprotected.spaces.private.sites).toContainEqual(
      expect.objectContaining({ id: 'protected-site' }),
    );
    await repo.close();
  });
});
