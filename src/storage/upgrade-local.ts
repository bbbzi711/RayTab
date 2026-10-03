import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { defaultSettings, groupSchema, rayStateSchema, siteSchema, spaceDataSchema } from './model';

// Only the published local v2/v3/v4 formats enter through this conversion boundary.
const legacySiteSchema = siteSchema.omit({ icon: true, iconBackground: true }).extend({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  iconId: z.string().min(1).max(100).optional(),
});
const legacySpaceSchema = z.object({
  groups: z.array(groupSchema),
  folders: spaceDataSchema.shape.folders,
  sites: z.array(legacySiteSchema),
  tombstones: spaceDataSchema.shape.tombstones,
});
const oldSpaceSchema = z.object({
  desktops: z.array(groupSchema),
  categories: z.array(z.object({ id: z.string(), desktopId: z.string(), order: z.number() })),
  sites: z.array(
    legacySiteSchema.omit({ groupId: true, folderId: true }).extend({ categoryId: z.string() }),
  ),
  tombstones: z.array(
    z.object({
      id: z.string(),
      entity: z.enum(['desktop', 'category', 'site']),
      deletedAt: z.number(),
      changeId: z.string(),
    }),
  ),
});

export function upgradeV4Site(value: unknown) {
  const { color, iconId, ...site } = legacySiteSchema.parse(value);
  return siteSchema.parse({
    ...site,
    icon: iconId ? { source: 'resource', resourceId: iconId } : { source: 'auto' },
    iconBackground: { mode: 'color', color },
  });
}

export function upgradeV4Space(value: unknown) {
  const old = legacySpaceSchema.parse(value);
  return spaceDataSchema.parse({ ...old, sites: old.sites.map(upgradeV4Site) });
}

export function upgradeLocalSpace(value: unknown) {
  const current = spaceDataSchema.safeParse(value);
  if (current.success) return current.data;
  if (!value || typeof value !== 'object' || !('desktops' in value)) return upgradeV4Space(value);
  const old = oldSpaceSchema.parse(value);
  const categories = new Map(old.categories.map((item) => [item.id, item]));
  const sites = [...old.sites].sort(
    (a, b) =>
      (categories.get(a.categoryId)?.order ?? 0) - (categories.get(b.categoryId)?.order ?? 0) ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
  const orders = new Map<string, number>();
  return spaceDataSchema.parse({
    groups: old.desktops,
    folders: [],
    sites: sites.map(({ categoryId, ...site }) => {
      const groupId = categories.get(categoryId)?.desktopId;
      if (!groupId)
        throw new AppError('messages.anExistingSiteReferencesAMissingCategoryDataWasNotMigrated');
      const order = orders.get(groupId) ?? 0;
      orders.set(groupId, order + 1);
      return upgradeV4Site({ ...site, groupId, folderId: null, order });
    }),
    tombstones: old.tombstones
      .filter((item) => item.entity !== 'category')
      .map((item) => ({ ...item, entity: item.entity === 'desktop' ? 'group' : 'site' })),
  });
}

export function upgradeSettings(value: unknown, fullSettings = false) {
  const settings = z.record(z.string(), z.unknown()).parse(value);
  const { showCategories, showGroups, iconSize, ...rest } = settings;
  const radius = fullSettings ? { iconRadius: defaultSettings.iconRadius } : {};
  if (iconSize === undefined) return { ...radius, ...rest };

  const pixels = z.number().int().min(44).max(80).parse(iconSize);
  const cardSize = Math.max(defaultSettings.cardSize, Math.ceil(pixels / 0.65));
  return {
    ...(fullSettings && {
      sidebarMode: defaultSettings.sidebarMode,
    }),
    ...radius,
    ...rest,
    cardSize,
    iconSizeRatio: pixels / cardSize,
  };
}

export function hasRetiredAppearanceSettings(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('showCardBackground' in value ||
      'cardOpacity' in value ||
      'navigationCollapsed' in value ||
      'showGroups' in value)
  );
}

export function hasRetiredIconDisplay(space: unknown) {
  return (
    typeof space === 'object' &&
    space !== null &&
    'sites' in space &&
    Array.isArray(space.sites) &&
    space.sites.some(
      (site: unknown) =>
        typeof site === 'object' &&
        site !== null &&
        (('icon' in site &&
          typeof site.icon === 'object' &&
          site.icon !== null &&
          'display' in site.icon) ||
          ('iconBackground' in site &&
            typeof site.iconBackground === 'object' &&
            site.iconBackground !== null &&
            'mode' in site.iconBackground &&
            site.iconBackground.mode === 'transparent')),
    )
  );
}

export function upgradeLocalState(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    ![2, 3, 4].includes(Number(value.schemaVersion))
  ) {
    const current = rayStateSchema.parse(value);
    if (
      typeof value === 'object' &&
      value !== null &&
      (('normalSettings' in value && hasRetiredAppearanceSettings(value.normalSettings)) ||
        ('privateSettingOverrides' in value &&
          hasRetiredAppearanceSettings(value.privateSettingOverrides)) ||
        ('spaces' in value &&
          typeof value.spaces === 'object' &&
          value.spaces !== null &&
          (('normal' in value.spaces && hasRetiredIconDisplay(value.spaces.normal)) ||
            ('private' in value.spaces && hasRetiredIconDisplay(value.spaces.private)))))
    )
      current.revision++;
    return current;
  }
  const old = z
    .object({
      schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      revision: z.number().int().nonnegative(),
      spaces: z.object({ normal: z.unknown(), private: z.unknown() }),
      normalSettings: z.unknown(),
      privateSettingOverrides: z.unknown(),
      local: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(value);
  return rayStateSchema.parse({
    ...old,
    schemaVersion: 5,
    revision: old.revision + 1,
    normalSettings: upgradeSettings(old.normalSettings, true),
    privateSettingOverrides: upgradeSettings(old.privateSettingOverrides),
    spaces: {
      normal: upgradeLocalSpace(old.spaces.normal),
      private: upgradeLocalSpace(old.spaces.private),
    },
    local:
      old.schemaVersion === 2
        ? {
            ...old.local,
            activeGroup: old.local.activeDesktop,
            selectedFolder: { normal: {}, private: {} },
          }
        : old.local,
  });
}
