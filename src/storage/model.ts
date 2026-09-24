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

export const desktopSchema = z.object({
  ...recordMeta,
  name: titleSchema,
  order: z.number().int().nonnegative(),
});
export const categorySchema = z.object({
  ...recordMeta,
  desktopId: idSchema,
  name: titleSchema,
  color: colorSchema,
  order: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  showInAll: z.boolean(),
});
export const siteSchema = z.object({
  ...recordMeta,
  categoryId: idSchema,
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
  entity: z.enum(['desktop', 'category', 'site']),
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
  showCategories: z.boolean(),
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
  overlay: z.number().min(0).max(0.8),
  textColorMode: z.enum(['auto', 'light', 'dark', 'custom']),
  textColors: homeTextColorsSchema,
});

const spaceDataBaseSchema = z.object({
  desktops: z.array(desktopSchema).max(200),
  categories: z.array(categorySchema).max(2000),
  sites: z.array(siteSchema).max(10000),
  tombstones: z.array(tombstoneSchema).max(20000),
});
export const spaceDataSchema = spaceDataBaseSchema.superRefine((space, ctx) => {
  const desktopIds = new Set(space.desktops.map((item) => item.id));
  const categoryIds = new Set(space.categories.map((item) => item.id));
  const siteIds = new Set(space.sites.map((item) => item.id));
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!space.desktops.length) issue('空间必须至少保留一个桌面');
  if (desktopIds.size !== space.desktops.length) issue('桌面 ID 重复');
  if (categoryIds.size !== space.categories.length) issue('分类 ID 重复');
  if (siteIds.size !== space.sites.length) issue('网站 ID 重复');
  for (const desktop of space.desktops) {
    const defaults = space.categories.filter(
      (category) => category.desktopId === desktop.id && category.isDefault,
    );
    if (defaults.length !== 1) issue(`桌面 ${desktop.id} 必须有且只有一个默认分类`);
  }
  for (const category of space.categories)
    if (!desktopIds.has(category.desktopId)) issue(`分类 ${category.id} 引用了不存在的桌面`);
  for (const site of space.sites)
    if (!categoryIds.has(site.categoryId)) issue(`网站 ${site.id} 引用了不存在的分类`);
});
export const localStateSchema = z.object({
  activeSpace: spaceIdSchema,
  activeDesktop: z.record(spaceIdSchema, idSchema),
  selectedCategory: z.record(spaceIdSchema, z.record(idSchema, idSchema.nullable())),
  homeMode: z.enum(['focus', 'navigation']).default('focus'),
  onboardingComplete: z.boolean(),
});
export const rayStateSchema = z
  .object({
    schemaVersion: z.literal(2),
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
        !state.spaces[spaceId].desktops.some(
          (item) => item.id === state.local.activeDesktop[spaceId],
        )
      )
        ctx.addIssue({ code: 'custom', message: `${spaceId} 空间的当前桌面不存在` });
    }
    const validateEngines = (settings: SpaceSettings, label: string) => {
      const ids = settings.searchEngines.map((engine) => engine.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: `${label}搜索引擎 ID 重复` });
      if (!ids.includes(settings.searchEngine))
        ctx.addIssue({ code: 'custom', message: `${label}当前搜索引擎不存在` });
    };
    validateEngines(state.normalSettings, '普通空间');
    validateEngines({ ...state.normalSettings, ...state.privateSettingOverrides }, '私密空间');
  });

export type Desktop = z.infer<typeof desktopSchema>;
export type Category = z.infer<typeof categorySchema>;
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
  showCategories: true,
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
  const desktopId = `${prefix}-desktop-home`;
  const defaultCategoryId = `${prefix}-category-default`;
  const workId = `${prefix}-category-work`;
  const toolsId = `${prefix}-category-tools`;
  const designId = `${prefix}-category-design`;
  const categories: Category[] = [
    {
      ...meta(defaultCategoryId),
      desktopId,
      name: '未分类',
      color: '#718096',
      order: 0,
      isDefault: true,
      showInAll: true,
    },
    {
      ...meta(workId),
      desktopId,
      name: '工作与开发',
      color: '#4f7c68',
      order: 1,
      isDefault: false,
      showInAll: true,
    },
    {
      ...meta(toolsId),
      desktopId,
      name: '常用工具',
      color: '#718096',
      order: 2,
      isDefault: false,
      showInAll: true,
    },
    {
      ...meta(designId),
      desktopId,
      name: '设计与灵感',
      color: '#c08b61',
      order: 3,
      isDefault: false,
      showInAll: true,
    },
  ];
  const examples = [
    ['GitHub', 'https://github.com', '#24292f', workId],
    ['Google', 'https://www.google.com', '#4285f4', toolsId],
    ['微博', 'https://weibo.com', '#e6162d', designId],
    ['哔哩哔哩', 'https://www.bilibili.com', '#fb7299', designId],
    ['YouTube', 'https://www.youtube.com', '#ff0033', designId],
  ];
  return {
    desktops: [{ ...meta(desktopId), name: '主页', order: 0 }],
    categories,
    sites: withExamples
      ? examples.map(([title, url, color, categoryId], order) => ({
          ...meta(`${prefix}-site-${order}`),
          categoryId,
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
    schemaVersion: 2,
    revision: 0,
    spaces: { normal, private: privateSpace },
    normalSettings: { ...defaultSettings },
    privateSettingOverrides: {},
    privateSecurity: { protected: false, locked: false },
    local: {
      activeSpace: 'normal',
      activeDesktop: { normal: normal.desktops[0].id, private: privateSpace.desktops[0].id },
      selectedCategory: { normal: {}, private: {} },
      homeMode: 'focus',
      onboardingComplete: false,
    },
  };
}
export function createLockedPrivateSpace() {
  return createSpace('private', false);
}
export function effectiveSettings(state: RayState, spaceId: SpaceId) {
  return spaceId === 'normal'
    ? state.normalSettings
    : { ...state.normalSettings, ...state.privateSettingOverrides };
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
