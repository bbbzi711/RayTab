import type { IDBPDatabase } from 'idb';
import { expect } from 'vitest';
import { decryptJson, importVaultKey, openChunk } from '../../src/security/crypto';
import type { Folder, Group, RayState, Site } from '../../src/storage/model';

// These fixtures have only ordinary groups in the public directory, including
// locked legacy vaults whose labels cannot be read before authentication.
export function expectFixtureCatalog(raw: unknown, state: RayState) {
  const normal = state.spaces.normal;
  expect(raw).toEqual({
    schemaVersion: 6,
    revision: state.revision,
    passwordProtected: state.privateSecurity.protected,
    groups: normal.groups.map((group) => ({
      storage: 'plain',
      group,
      folders: normal.folders.filter((f) => f.groupId === group.id),
      sites: normal.sites.filter((s) => s.groupId === group.id),
    })),
    tombstones: normal.tombstones,
    settings: state.normalSettings,
    ...(!state.privateSecurity.protected && Object.keys(state.privateSettingOverrides).length
      ? { legacySettings: state.privateSettingOverrides }
      : {}),
    local: {
      groupId: state.local.activeGroup.normal,
      folders: Object.entries(state.local.selectedFolder.normal).map(([groupId, folderId]) => ({
        groupId,
        folderId,
      })),
      homeMode: state.local.homeMode,
      onboardingComplete: state.local.onboardingComplete,
    },
  });
}

type Ref = { id: string; slot: string };
type Directory = {
  version: number;
  format: string;
  key: string;
  groups: Ref[];
  resources: Ref[];
  tombstones: unknown[];
  overrides: unknown;
};
type Body = { group: Group; folders: Folder[]; sites: Site[] };
type Resource = { id: string; type: string; data: string };

export async function inspectFixtureVault(db: IDBPDatabase, password: string) {
  const directory = await decryptJson<Directory>(await db.get('vault', 'private'), password);
  expect(directory).toMatchObject({ format: 'raytab-group-vault', version: 1 });
  const key = await importVaultKey(directory.key);
  const record = async (kind: 'groups' | 'resources', { id, slot }: Ref) => {
    const chunk = await db.get('vault', slot);
    expect(chunk).toEqual({ version: 2, iv: expect.any(String), ciphertext: expect.any(String) });
    return openChunk(chunk, key, JSON.stringify(['raytab-local-vault', 1, kind, id, slot]));
  };
  expect((await db.getAllKeys('vault')).sort()).toEqual(
    [
      'private',
      ...directory.groups.map((r) => r.slot),
      ...directory.resources.map((r) => r.slot),
    ].sort(),
  );
  const groups = await Promise.all(
    directory.groups.map(async (ref) => {
      const body = (await record('groups', ref)) as Body;
      expect(body.group.id).toBe(ref.id);
      return body;
    }),
  );
  const resources = await Promise.all(
    directory.resources.map(async (ref) => {
      const resource = (await record('resources', ref)) as Resource;
      expect(resource.id).toBe(ref.id);
      return resource;
    }),
  );
  return { groups, resources, tombstones: directory.tombstones, overrides: directory.overrides };
}
