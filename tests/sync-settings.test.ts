import { describe, expect, it } from 'vitest';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSyncDraftSchema } from '../src/features/settings/SyncSettings';

const draft = {
  type: 'webdav' as const,
  url: 'https://dav.example.test/raytab.json',
  username: 'user',
  password: 'connection-password',
  token: '',
  owner: '',
  repo: '',
  path: 'raytab.json',
  branch: '',
  automatic: true,
  includePrivate: true,
  privatePassword: 'private-password',
};

describe('sync connection private-space protection', () => {
  it.each(['', 'private-password'])(
    'rejects a private connection while locked even when a password was supplied (%s)',
    async (privatePassword) => {
      const resolver = zodResolver(createSyncDraftSchema(true));
      const result = await resolver({ ...draft, privatePassword }, undefined, {
        fields: {},
        shouldUseNativeValidation: false,
      });

      expect(result.errors.privatePassword?.message).toBe('settings.unlockPrivateForSync');
      expect(result.values).toEqual({});
    },
  );

  it('allows saving a normal-space connection while private space is locked', () => {
    const normal = { ...draft, includePrivate: false, privatePassword: '' };
    expect(createSyncDraftSchema(true).parse(normal)).toEqual(normal);
  });

  it('requires a valid password again after private space is unlocked', () => {
    const schema = createSyncDraftSchema(false);
    expect(schema.parse(draft)).toEqual(draft);
    const emptyPassword = schema.safeParse({ ...draft, privatePassword: '' });
    expect(emptyPassword.success).toBe(false);
    if (!emptyPassword.success)
      expect(emptyPassword.error.issues).toEqual([
        expect.objectContaining({
          path: ['privatePassword'],
          message: 'settings.passwordLength',
        }),
      ]);
  });
});
