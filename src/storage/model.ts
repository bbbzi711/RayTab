import { AppError } from '@/lib/errors';
import { z } from 'zod';

export const spaceIdSchema = z.enum(['normal', 'private']);
export type SpaceId = z.infer<typeof spaceIdSchema>;

const idSchema = z.string().min(1).max(100);
const titleSchema = z.string().trim().min(1).max(80);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const timestampSchema = z.number().int().nonnegative();
export const searchEngineSchema = z.object({
  id: idSchema,
  name: titleSchema,
  url: z
    .string()
    .max(500)
    .refine((value) => {
      if (!value.includes('%s')) return false;
      try {
        const url = new URL(value.replace('%s', 'query'));
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }, 'messages.theSearchUrlMustBeAnHttpOrHttpsAddressContainingS'),
});
const recordMeta = {
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  changeId: idSchema,
};

export const groupSchema = z.object({
  ...recordMeta,
  name: titleSchema,
  order: z.number().int().nonnegative(),
});
export const folderSchema = z.object({
  ...recordMeta,
  groupId: idSchema,
  name: titleSchema,
  order: z.number().int().nonnegative(),
});
export const siteIconSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('text'),
    text: z
      .string()
      .trim()
      .refine((value) => {
        const length = Array.from(value).length;
        return length >= 1 && length <= 4;
      }, 'navigation.invalidIconText'),
  }),
  z.object({ source: z.literal('auto'), resourceId: idSchema.optional() }),
  z.object({
    source: z.literal('resource'),
    resourceId: idSchema,
  }),
]);
export const siteIconBackgroundSchema = z.union([
  z.object({ mode: z.literal('auto') }),
  // Read existing saved/backup data at the validation boundary; current output is always solid.
  z.object({ mode: z.literal('transparent') }).transform(() => ({ mode: 'auto' as const })),
  z.object({ mode: z.literal('color'), color: colorSchema }),
]);
export type SiteIconConfig = z.infer<typeof siteIconSchema>;
export type SiteIconBackground = z.infer<typeof siteIconBackgroundSchema>;
export const defaultSiteIcon: SiteIconConfig = { source: 'auto' };
export const defaultSiteIconBackground: SiteIconBackground = { mode: 'auto' };
export const siteSchema = z.object({
  ...recordMeta,
  groupId: idSchema,
  folderId: idSchema.nullable(),
  title: titleSchema,
  url: z.url().refine((value) => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  }, 'messages.onlyHttpOrHttpsUrlsWithoutEmbeddedCredentialsAreSupported'),
  icon: siteIconSchema,
  iconBackground: siteIconBackgroundSchema,
  order: z.number().int().nonnegative(),
});
export const tombstoneSchema = z.object({
  id: idSchema,
  entity: z.enum(['group', 'folder', 'site']),
  deletedAt: timestampSchema,
  changeId: idSchema,
});
export const spaceSettingsSchema = z.object({
  language: z.enum(['zh-CN', 'en']).default('zh-CN'),
  theme: z.enum(['system', 'light', 'dark']),
  searchEngine: idSchema,
  searchEngines: z.array(searchEngineSchema).min(1).max(20),
  openInNewTab: z.boolean(),
  showClock: z.boolean(),
  showSearch: z.boolean(),
  showDate: z.boolean(),
  showLunar: z.boolean(),
  showGreeting: z.boolean(),
  showSiteTitle: z.boolean(),
  hour12: z.boolean(),
  cardSize: z.number().int().min(80).max(160),
  iconSizeRatio: z.number().min(0.28).max(0.65),
  maxCardsPerRow: z.number().int().min(4).max(12),
  iconSpacing: z.number().int().min(8).max(48),
  iconRadius: z.number().min(0).max(50),
  sidebarMode: z.enum(['always', 'auto', 'hidden']).default('always'),
  background: z.enum(['gradient', 'bing', 'unsplash', 'custom', 'color']),
  gradient: z.string().max(300),
  solidColor: colorSchema,
  wallpaperId: idSchema.optional(),
  onlineWallpaperUrl: z.url().optional(),
  featuredPhotoUrl: z.url().optional(),
  overlay: z.number().min(0).max(0.8),
});

const spaceDataBaseSchema = z.object({
  groups: z.array(groupSchema).max(200),
  folders: z.array(folderSchema).max(2000),
  sites: z.array(siteSchema).max(10000),
  tombstones: z.array(tombstoneSchema).max(20000),
});
export const spaceDataSchema = spaceDataBaseSchema.superRefine((space, ctx) => {
  const groupIds = new Set(space.groups.map((item) => item.id));
  const folderIds = new Set(space.folders.map((item) => item.id));
  const siteIds = new Set(space.sites.map((item) => item.id));
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!space.groups.length) issue('errors.model.groupRequired');
  if (groupIds.size !== space.groups.length) issue('errors.model.duplicateGroupId');
  if (folderIds.size !== space.folders.length) issue('errors.model.duplicateFolderId');
  if (siteIds.size !== space.sites.length) issue('errors.model.duplicateSiteId');
  if (space.sites.some((item) => folderIds.has(item.id)))
    issue('errors.model.duplicateNavigationId');
  for (const folder of space.folders)
    if (!groupIds.has(folder.groupId)) issue('errors.model.missingFolderGroup');
  for (const site of space.sites) {
    if (!groupIds.has(site.groupId)) issue('errors.model.missingSiteGroup');
    if (
      site.folderId !== null &&
      !space.folders.some(
        (folder) => folder.id === site.folderId && folder.groupId === site.groupId,
      )
    )
      issue('errors.model.missingSiteFolder');
  }
});
export const localStateSchema = z.object({
  activeSpace: spaceIdSchema,
  activeGroup: z.record(spaceIdSchema, idSchema),
  selectedFolder: z.record(spaceIdSchema, z.record(idSchema, idSchema.nullable())),
  homeMode: z.enum(['focus', 'navigation']).default('navigation'),
  onboardingComplete: z.boolean(),
});
export const rayStateSchema = z
  .object({
    schemaVersion: z.literal(5),
    revision: z.number().int().nonnegative(),
    spaces: z.object({ normal: spaceDataSchema, private: spaceDataSchema }),
    normalSettings: spaceSettingsSchema,
    privateSettingOverrides: spaceSettingsSchema.partial().extend({
      language: z.enum(['zh-CN', 'en']).optional(),
      sidebarMode: z.enum(['always', 'auto', 'hidden']).optional(),
    }),
    privateSecurity: z.object({ protected: z.boolean(), locked: z.boolean() }),
    local: localStateSchema,
  })
  .superRefine((state, ctx) => {
    for (const spaceId of spaceIdSchema.options) {
      if (
        !state.spaces[spaceId].groups.some((item) => item.id === state.local.activeGroup[spaceId])
      )
        ctx.addIssue({ code: 'custom', message: 'errors.model.missingActiveGroup' });
    }
    const validateEngines = (settings: SpaceSettings) => {
      const ids = settings.searchEngines.map((engine) => engine.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: 'errors.model.duplicateSearchEngineId' });
      if (!ids.includes(settings.searchEngine))
        ctx.addIssue({ code: 'custom', message: 'errors.model.missingSearchEngine' });
    };
    validateEngines(state.normalSettings);
    validateEngines(effectiveSettings(state, 'private'));
  });

export type Group = z.infer<typeof groupSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type Site = z.infer<typeof siteSchema>;
export type Tombstone = z.infer<typeof tombstoneSchema>;
export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;
export type SearchEngine = z.infer<typeof searchEngineSchema>;
export type SpaceData = z.infer<typeof spaceDataSchema>;
export type RayState = z.infer<typeof rayStateSchema>;

export const defaultSettings: SpaceSettings = {
  language: 'zh-CN',
  theme: 'system',
  searchEngine: 'bing',
  searchEngines: [
    { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=%s' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  ],
  openInNewTab: true,
  showClock: true,
  showSearch: true,
  showDate: true,
  showLunar: true,
  showGreeting: true,
  showSiteTitle: true,
  hour12: false,
  cardSize: 110,
  iconSizeRatio: 0.55,
  maxCardsPerRow: 8,
  iconSpacing: 20,
  iconRadius: 24,
  sidebarMode: 'always',
  background: 'custom',
  gradient: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
  solidColor: '#0b0f19',
  overlay: 0.1,
};

function meta(id: string, now = 0) {
  return { id, createdAt: now, updatedAt: now, changeId: `initial-${id}` };
}
function createSpace(prefix: SpaceId, withExamples: boolean): SpaceData {
  const groupId = `${prefix}-group-home`;
  const examples = [
    ['GitHub', 'https://github.com'],
    ['Google', 'https://www.google.com'],
    ['微博', 'https://weibo.com'],
    ['哔哩哔哩', 'https://www.bilibili.com'],
    ['YouTube', 'https://www.youtube.com'],
  ];
  return {
    groups: [{ ...meta(groupId), name: '主页', order: 0 }],
    folders: [],
    sites: withExamples
      ? examples.map(([title, url], order) => ({
          ...meta(`${prefix}-site-${order}`),
          groupId,
          folderId: null,
          title,
          url,
          icon: { ...defaultSiteIcon },
          iconBackground: { ...defaultSiteIconBackground },
          order,
        }))
      : [],
    tombstones: [],
  };
}

export function createInitialState(): RayState {
  const normal = createSpace('normal', true);
  const privateSpace = createSpace('private', false);
  return {
    schemaVersion: 5,
    revision: 0,
    spaces: { normal, private: privateSpace },
    normalSettings: { ...defaultSettings },
    privateSettingOverrides: {},
    privateSecurity: { protected: false, locked: false },
    local: {
      activeSpace: 'normal',
      activeGroup: { normal: normal.groups[0].id, private: privateSpace.groups[0].id },
      selectedFolder: { normal: {}, private: {} },
      homeMode: 'navigation',
      onboardingComplete: false,
    },
  };
}
export function createLockedPrivateSpace() {
  return createSpace('private', false);
}
export function effectiveSettings(state: RayState, spaceId: SpaceId): SpaceSettings {
  const settings =
    spaceId === 'normal'
      ? state.normalSettings
      : { ...state.normalSettings, ...state.privateSettingOverrides };
  if (settings.searchEngines.some((engine) => engine.id === settings.searchEngine)) return settings;
  return { ...settings, searchEngine: settings.searchEngines[0].id };
}
export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new AppError('messages.enterAnHttpOrHttpsUrlWithoutEmbeddedCredentials');
  return url.href;
}
export function resourceIds(state: RayState) {
  return new Set(
    spaceIdSchema.options.flatMap((spaceId) => [
      ...spaceResourceIds(state.spaces[spaceId], effectiveSettings(state, spaceId)),
    ]),
  );
}
export function spaceResourceIds(space: SpaceData, settings: Pick<SpaceSettings, 'wallpaperId'>) {
  const ids = new Set<string>();
  for (const site of space.sites)
    if ('resourceId' in site.icon && site.icon.resourceId) ids.add(site.icon.resourceId);
  if (settings.wallpaperId) ids.add(settings.wallpaperId);
  return ids;
}
