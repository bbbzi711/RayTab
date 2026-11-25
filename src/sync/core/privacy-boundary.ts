import { AppError } from '@/lib/errors';
import { z } from '@/lib/zod';
import { emptyGroupId } from '@/storage/group-privacy';
import type { SpaceData } from '@/storage/model';
import type { SyncConflict } from './merge';

export type ProtectionSelection =
  { groupId: string } | { contentsOfGroup: string } | { siteIds: string[] } | { folderId: string };
export const redactionsSchema = z.array(
  z.object({ kind: z.enum(['group', 'folder', 'site']), id: z.string(), hash: z.string() }),
);
export type Redactions = z.infer<typeof redactionsSchema>;
export async function digest(content: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function records(data?: SpaceData) {
  return [
    ...(data?.groups ?? []).map((value) => ({ kind: 'group' as const, value })),
    ...(data?.folders ?? []).map((value) => ({ kind: 'folder' as const, value })),
    ...(data?.sites ?? []).map((value) => ({ kind: 'site' as const, value })),
  ];
}
const keyOf = (kind: string, id: string) => JSON.stringify([kind, id]);
export async function redactBaseline(
  selection: ProtectionSelection | ProtectionSelection[],
  current: SpaceData,
  conflicts: SyncConflict[],
  baseline?: SpaceData,
) {
  const groups = new Set<string>();
  const folders = new Set<string>();
  const sites = new Set<string>();
  for (const target of Array.isArray(selection) ? selection : [selection]) {
    if ('siteIds' in target) for (const id of target.siteIds) sites.add(id);
    else if ('folderId' in target) folders.add(target.folderId);
    else groups.add('groupId' in target ? target.groupId : target.contentsOfGroup);
  }
  const ids = new Set<string>();
  for (const entry of [...records(current), ...records(baseline)]) {
    if (
      groups.has(entry.kind === 'group' ? entry.value.id : entry.value.groupId) ||
      (entry.kind === 'folder' && folders.has(entry.value.id)) ||
      (entry.kind === 'site' &&
        (sites.has(entry.value.id) || (entry.value.folderId && folders.has(entry.value.folderId))))
    )
      ids.add(keyOf(entry.kind, entry.value.id));
  }
  function matchesLocation(value: unknown) {
    if (!value || typeof value !== 'object') return false;
    return (
      ('groupId' in value &&
        typeof value.groupId === 'string' &&
        ids.has(keyOf('group', value.groupId))) ||
      ('folderId' in value &&
        typeof value.folderId === 'string' &&
        ids.has(keyOf('folder', value.folderId)))
    );
  }
  if (
    conflicts.some(
      (item) =>
        ids.has(keyOf(item.entity, item.id)) ||
        matchesLocation(item.local) ||
        matchesLocation(item.remote),
    )
  )
    throw new AppError('errors.sync.resolveBeforeProtecting');
  const redactions: Redactions = [];
  if (!baseline) return redactions;
  for (const { kind, value } of records(baseline)) {
    if (ids.has(keyOf(kind, value.id)))
      redactions.push({ kind, id: value.id, hash: await digest(JSON.stringify(value)) });
  }
  baseline.groups = baseline.groups.filter((g) => !ids.has(keyOf('group', g.id)));
  baseline.folders = baseline.folders.filter((f) => !ids.has(keyOf('folder', f.id)));
  baseline.sites = baseline.sites.filter((s) => !ids.has(keyOf('site', s.id)));
  if (!baseline.groups.length) {
    const id = emptyGroupId('normal');
    baseline.groups.push({ id, name: 'Home', order: 0, createdAt: 0, updatedAt: 0, changeId: id });
  }
  return redactions;
}

// A device that last saw an ordinary group can still have unsynchronized edits,
// including new children without an ID in the encrypted index. Refuse to publish
// any of those children in an ordinary recovery group.
export async function assertUnchangedPlainCopies(
  plain: SpaceData | undefined,
  protectedIds: { groups: Set<string>; children: Set<string> },
  baseline?: SpaceData,
  redacted: Redactions = [],
  authorized: { groups: Set<string>; children: Set<string> } = {
    groups: new Set(),
    children: new Set(),
  },
) {
  if (!plain || (!protectedIds.groups.size && !protectedIds.children.size)) return;
  const previous = new Map(
    records(baseline).map(({ kind, value }) => [keyOf(kind, value.id), JSON.stringify(value)]),
  );
  const hashes = new Map(redacted.map((r) => [keyOf(r.kind, r.id), r.hash]));
  for (const { kind, value } of records(plain)) {
    const groupId = 'groupId' in value ? value.groupId : value.id;
    if (
      authorized.groups.has(groupId) ||
      (kind !== 'group' && authorized.children.has(value.id)) ||
      (!protectedIds.groups.has(groupId) &&
        (kind === 'group' || !protectedIds.children.has(value.id)))
    )
      continue;
    const key = keyOf(kind, value.id);
    const serialized = JSON.stringify(value);
    if (
      previous.get(key) !== serialized &&
      (!hashes.has(key) || hashes.get(key) !== (await digest(serialized)))
    )
      throw new AppError('navigation.encryptedGroupConflict');
  }
}

export function recordIds(data?: SpaceData) {
  return {
    groups: new Set(data?.groups.map((g) => g.id)),
    children: new Set([...(data?.sites ?? []), ...(data?.folders ?? [])].map((r) => r.id)),
  };
}
export function difference(a: ReturnType<typeof recordIds>, b: ReturnType<typeof recordIds>) {
  return {
    groups: new Set([...a.groups].filter((id) => !b.groups.has(id))),
    children: new Set([...a.children].filter((id) => !b.children.has(id))),
  };
}
