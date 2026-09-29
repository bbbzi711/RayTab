import { z } from 'zod';
import { defaultSettings, groupSchema, rayStateSchema, siteSchema, spaceDataSchema } from './model';

// Convert persisted v2 data once; the application uses only the group/folder model.
const oldSpaceSchema = z.object({
  desktops: z.array(groupSchema),
  categories: z.array(z.object({ id: z.string(), desktopId: z.string(), order: z.number() })),
  sites: z.array(
    siteSchema.omit({ groupId: true, folderId: true }).extend({ categoryId: z.string() }),
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

export function upgradeLocalSpace(value: unknown) {
  if (!value || typeof value !== 'object' || !('desktops' in value))
    return spaceDataSchema.parse(value);
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
      if (!groupId) throw new Error('旧网站引用的分类不存在，未迁移数据');
      const order = orders.get(groupId) ?? 0;
      orders.set(groupId, order + 1);
      return { ...site, groupId, folderId: null, order };
    }),
    tombstones: old.tombstones
      .filter((item) => item.entity !== 'category')
      .map((item) => ({
        ...item,
        entity: item.entity === 'desktop' ? 'group' : 'site',
      })),
  });
}

export function upgradeSettings(value: unknown, fullSettings = false) {
  const settings = z.record(z.string(), z.unknown()).parse(value);
  const { showCategories, iconSize, ...rest } = settings;
  const renamed = showCategories === undefined ? rest : { ...rest, showGroups: showCategories };
  if (iconSize === undefined) return renamed;

  // The reverted v3 UI stored pixels instead of a card size and icon ratio.
  const pixels = z.number().int().min(44).max(80).parse(iconSize);
  const cardSize = Math.max(defaultSettings.cardSize, Math.ceil(pixels / 0.65));
  return {
    ...(fullSettings && {
      showGroups: defaultSettings.showGroups,
      showCardBackground: defaultSettings.showCardBackground,
      cardOpacity: defaultSettings.cardOpacity,
      navigationCollapsed: defaultSettings.navigationCollapsed,
      sidebarMode: defaultSettings.sidebarMode,
    }),
    ...renamed,
    cardSize,
    iconSizeRatio: pixels / cardSize,
  };
}

export function upgradeLocalState(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    (value.schemaVersion !== 2 && value.schemaVersion !== 3)
  )
    return rayStateSchema.parse(value);
  if (value.schemaVersion === 3) {
    const old = z
      .object({
        revision: z.number(),
        normalSettings: z.unknown(),
        privateSettingOverrides: z.unknown(),
      })
      .passthrough()
      .parse(value);
    return rayStateSchema.parse({
      ...old,
      schemaVersion: 4,
      revision: old.revision + 1,
      normalSettings: upgradeSettings(old.normalSettings, true),
      privateSettingOverrides: upgradeSettings(old.privateSettingOverrides),
    });
  }
  const old = z
    .object({
      revision: z.number(),
      spaces: z.object({ normal: z.unknown(), private: z.unknown() }),
      normalSettings: z.unknown(),
      privateSettingOverrides: z.unknown(),
      local: z.object({
        activeDesktop: z.object({ normal: z.string(), private: z.string() }),
        homeMode: z.enum(['focus', 'navigation']).default('focus'),
        onboardingComplete: z.boolean(),
        activeSpace: z.enum(['normal', 'private']),
      }),
    })
    .passthrough()
    .parse(value);
  return rayStateSchema.parse({
    ...old,
    schemaVersion: 4,
    revision: old.revision + 1,
    normalSettings: upgradeSettings(old.normalSettings),
    privateSettingOverrides: upgradeSettings(old.privateSettingOverrides),
    spaces: {
      normal: upgradeLocalSpace(old.spaces.normal),
      private: upgradeLocalSpace(old.spaces.private),
    },
    local: {
      ...old.local,
      activeGroup: old.local.activeDesktop,
      selectedFolder: { normal: {}, private: {} },
    },
  });
}
