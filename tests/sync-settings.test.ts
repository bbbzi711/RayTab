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

describe('WebDAV server address validation', () => {
  it.each([
    'file:///backup.json',
    'https://dav.jianguoyun.com/tab',
    'https://user:password@dav.example.test/',
  ])('rejects an invalid server URL with a field error (%s)', async (url) => {
    const resolver = zodResolver(createSyncDraftSchema(false));
    const result = await resolver({ ...draft, url }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors.url?.message).toBe('settings.syncInvalidUrl');
    expect(result.values).toEqual({});
  });

  it.each([
    'https://dav.jianguoyun.com/dav/',
    'https://dav.jianguoyun.com/dav',
    'https://dav.example.test',
    'https://dav.example.test/RayTab/',
    'https://dav.jianguoyun.com/dav/raytab.json',
    'http://127.0.0.1:8080/RayTab/backup',
    'https://dav.example.test/RayTab/backup.json?version=latest',
  ])('accepts server URLs and existing file URLs (%s)', (url) => {
    expect(createSyncDraftSchema(false).parse({ ...draft, url })).toEqual({ ...draft, url });
  });
});

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

  it('requires manual sync for a protected private space while retaining normal-space scheduling', () => {
    const schema = createSyncDraftSchema(false, true);
    const scheduledPrivate = schema.safeParse(draft);
    expect(scheduledPrivate.success).toBe(false);
    if (!scheduledPrivate.success)
      expect(scheduledPrivate.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['automatic'],
          message: 'settings.protectedPrivateAutomaticSync',
        }),
      );
    expect(schema.parse({ ...draft, automatic: false })).toMatchObject({
      includePrivate: true,
      automatic: false,
    });
    expect(schema.parse({ ...draft, includePrivate: false })).toMatchObject({
      includePrivate: false,
      automatic: true,
    });
  });
});
