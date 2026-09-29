import { z } from 'zod';

export const spaceIdSchema = z.enum(['normal', 'private']);
export type SpaceId = z.infer<typeof spaceIdSchema>;

const idSchema = z.string().min(1).max(100);
const titleSchema = z.string().trim().min(1).max(80);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const timestampSchema = z.number().int().nonnegative();
const greetingListSchema = z.array(z.string().trim().min(1).max(120)).max(50);
const homeTextColorsSchema = z.object({
  clock: colorSchema,
  date: colorSchema,
  greeting: colorSchema,
  search: colorSchema,
  tabs: colorSchema,
  cards: colorSchema,
});
export const customGreetingsSchema = z
  .object({
    morning: greetingListSchema.optional(),
    noon: greetingListSchema.optional(),
    afternoon: greetingListSchema.optional(),
    evening: greetingListSchema.optional(),
    night: greetingListSchema.optional(),
  })
  .refine((value) => Object.values(value).some((items) => items?.length), '至少需要一组问候语');
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
    }, '搜索地址必须是包含 %s 的 http 或 https 地址'),
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
export const siteSchema = z.object({
  ...recordMeta,
  groupId: idSchema,
  folderId: idSchema.nullable(),
  title: titleSchema,
  url: z.url().refine((value) => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  }, '只支持不含账号密码的 http 或 https 网址'),
  color: colorSchema,
  iconId: idSchema.optional(),
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
  customGreetings: customGreetingsSchema.optional(),
  showSiteTitle: z.boolean(),
  showGroups: z.boolean(),
  hour12: z.boolean(),
  cardSize: z.number().int().min(80).max(160),
  iconSizeRatio: z.number().min(0.28).max(0.65),
  maxCardsPerRow: z.number().int().min(4).max(12),
  iconSpacing: z.number().int().min(8).max(48),
  showCardBackground: z.boolean(),
  cardOpacity: z.number().min(0.05).max(0.95),
  navigationCollapsed: z.boolean(),
  sidebarMode: z.enum(['always', 'auto', 'hidden']).default('always'),
  background: z.enum(['gradient', 'bing', 'unsplash', 'custom', 'color']),
  gradient: z.string().max(300),
  solidColor: colorSchema,
  wallpaperId: idSchema.optional(),
  onlineWallpaperUrl: z.url().optional(),
  featuredPhotoUrl: z.url().optional(),
  overlay: z.number().min(0).max(0.8),
  textColorMode: z.enum(['auto', 'light', 'dark', 'custom']),
  textColors: homeTextColorsSchema,
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
  if (!space.groups.length) issue('空间必须至少保留一个分组');
  if (groupIds.size !== space.groups.length) issue('分组 ID 重复');
  if (folderIds.size !== space.folders.length) issue('文件夹 ID 重复');
  if (siteIds.size !== space.sites.length) issue('网站 ID 重复');
  if (space.sites.some((item) => folderIds.has(item.id))) issue('网站与文件夹 ID 重复');
  for (const folder of space.folders)
    if (!groupIds.has(folder.groupId)) issue(`文件夹 ${folder.id} 引用了不存在的分组`);
  for (const site of space.sites) {
    if (!groupIds.has(site.groupId)) issue(`网站 ${site.id} 引用了不存在的分组`);
    if (
      site.folderId !== null &&
      !space.folders.some(
        (folder) => folder.id === site.folderId && folder.groupId === site.groupId,
      )
    )
      issue(`网站 ${site.id} 引用了不存在的文件夹`);
  }
});
export const localStateSchema = z.object({
  activeSpace: spaceIdSchema,
  activeGroup: z.record(spaceIdSchema, idSchema),
  selectedFolder: z.record(spaceIdSchema, z.record(idSchema, idSchema.nullable())),
  homeMode: z.enum(['focus', 'navigation']).default('focus'),
  onboardingComplete: z.boolean(),
});
export const rayStateSchema = z
  .object({
    schemaVersion: z.literal(4),
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
        ctx.addIssue({ code: 'custom', message: `${spaceId} 空间的当前分组不存在` });
    }
    const validateEngines = (settings: SpaceSettings, label: string) => {
      const ids = settings.searchEngines.map((engine) => engine.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: `${label}搜索引擎 ID 重复` });
      if (!ids.includes(settings.searchEngine))
        ctx.addIssue({ code: 'custom', message: `${label}当前搜索引擎不存在` });
    };
    validateEngines(state.normalSettings, '普通空间');
    validateEngines(effectiveSettings(state, 'private'), '私密空间');
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
  customGreetings: undefined,
  showSiteTitle: true,
  showGroups: true,
  hour12: false,
  cardSize: 110,
  iconSizeRatio: 0.55,
  maxCardsPerRow: 8,
  iconSpacing: 20,
  showCardBackground: false,
  cardOpacity: 0.2,
  navigationCollapsed: false,
  sidebarMode: 'always',
  background: 'custom',
  gradient: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
  solidColor: '#0b0f19',
  overlay: 0.1,
  textColorMode: 'auto',
  textColors: {
    clock: '#ffffff',
    date: '#ffffff',
    greeting: '#ffffff',
    search: '#ffffff',
    tabs: '#ffffff',
    cards: '#ffffff',
  },
};

function meta(id: string, now = 0) {
  return { id, createdAt: now, updatedAt: now, changeId: `initial-${id}` };
}
function createSpace(prefix: SpaceId, withExamples: boolean): SpaceData {
  const groupId = `${prefix}-group-home`;
  const examples = [
    ['GitHub', 'https://github.com', '#24292f'],
    ['Google', 'https://www.google.com', '#4285f4'],
    ['微博', 'https://weibo.com', '#e6162d'],
    ['哔哩哔哩', 'https://www.bilibili.com', '#fb7299'],
    ['YouTube', 'https://www.youtube.com', '#ff0033'],
  ];
  return {
    groups: [{ ...meta(groupId), name: '主页', order: 0 }],
    folders: [],
    sites: withExamples
      ? examples.map(([title, url, color], order) => ({
          ...meta(`${prefix}-site-${order}`),
          groupId,
          folderId: null,
          title,
          url,
          color,
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
    schemaVersion: 4,
    revision: 0,
    spaces: { normal, private: privateSpace },
    normalSettings: { ...defaultSettings },
    privateSettingOverrides: {},
    privateSecurity: { protected: false, locked: false },
    local: {
      activeSpace: 'normal',
      activeGroup: { normal: normal.groups[0].id, private: privateSpace.groups[0].id },
      selectedFolder: { normal: {}, private: {} },
      homeMode: 'focus',
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
    throw new Error('请输入不含账号密码的 http 或 https 网址');
  return url.href;
}
export function resourceIds(state: RayState) {
  const settings = [state.normalSettings, effectiveSettings(state, 'private')];
  return new Set(
    [
      ...settings.map((item) => item.wallpaperId),
      ...spaceIdSchema.options.flatMap((spaceId) =>
        state.spaces[spaceId].sites.map((site) => site.iconId),
      ),
    ].filter((value): value is string => Boolean(value)),
  );
}
