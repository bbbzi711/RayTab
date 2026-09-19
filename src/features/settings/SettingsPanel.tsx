import { Cloud, Database, Palette, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dispatch, privateVault } from '@/storage/store';
import { prepareImage } from '@/lib/images';
import { bingDailyUrl, gradientPresets, nextFeaturedPhoto } from '@/features/appearance/wallpapers';
import { DataSettings } from './DataSettings';
import { SyncSettings } from './SyncSettings';
import {
  customGreetingsSchema,
  searchEngineSchema,
  type RayState,
  type SpaceId,
  type SpaceSettings,
} from '@/storage/model';
import { t } from '@/locales';

export default function SettingsPanel({
  state,
  spaceId,
  open,
  onClose,
  onError,
}: {
  state: RayState;
  spaceId: SpaceId;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'preferences' | 'sync' | 'backup'>(
    'appearance',
  );
  const inherited = state.normalSettings;
  const overrides = state.privateSettingOverrides;
  const settings = spaceId === 'normal' ? inherited : { ...inherited, ...overrides };
  const tr = (text: string) => t(settings.language, text);
  const update = (patch: Partial<SpaceSettings>) =>
    void dispatch({ type: 'settings', spaceId, patch }).catch((error: Error) =>
      onError(error.message),
    );
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="settings-panel" closeLabel={tr('关闭')}>
        <DialogHeader>
          <DialogTitle>{tr('设置')}</DialogTitle>
          <DialogDescription>
            {spaceId === 'normal'
              ? tr('普通空间的外观与使用偏好。')
              : tr('私密空间默认跟随普通空间，可单独覆盖每项设置。')}
          </DialogDescription>
        </DialogHeader>
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label={tr('设置分类')}>
            {(
              [
                ['appearance', tr('外观'), Palette],
                ['preferences', tr('偏好'), SlidersHorizontal],
                ['sync', tr('同步'), Cloud],
                ['backup', tr('备份与迁移'), Database],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                type="button"
                key={value}
                className={activeTab === value ? 'active' : ''}
                onClick={() => setActiveTab(value)}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {activeTab === 'preferences' && (
              <SettingsSection title={tr('语言')}>
                <Segmented
                  label={tr('语言')}
                  value={settings.language}
                  options={[
                    ['zh-CN', tr('中文')],
                    ['en', tr('英文')],
                  ]}
                  onChange={(language) =>
                    void dispatch({
                      type: 'settings',
                      spaceId: 'normal',
                      patch: { language: language as SpaceSettings['language'] },
                    }).catch((error: Error) => onError(error.message))
                  }
                />
              </SettingsSection>
            )}
            {activeTab === 'appearance' && (
              <>
                <SettingsSection title={tr('布局')}>
                  <RangeSetting
                    label={tr('卡片大小')}
                    value={settings.cardSize}
                    min={80}
                    max={160}
                    step={5}
                    suffix="px"
                    onChange={(cardSize) => update({ cardSize })}
                  />
                  <RangeSetting
                    label={tr('图标比例')}
                    value={settings.iconSizeRatio}
                    min={0.28}
                    max={0.65}
                    step={0.01}
                    format={(value) => `${Math.round(value * 100)}%`}
                    onChange={(iconSizeRatio) => update({ iconSizeRatio })}
                  />
                  <RangeSetting
                    label={tr('每行最多')}
                    value={settings.maxCardsPerRow}
                    min={4}
                    max={12}
                    step={1}
                    suffix={` ${tr('个')}`}
                    onChange={(maxCardsPerRow) => update({ maxCardsPerRow })}
                  />
                  <RangeSetting
                    label={tr('图标间距')}
                    value={settings.iconSpacing}
                    min={8}
                    max={48}
                    step={2}
                    suffix="px"
                    onChange={(iconSpacing) => update({ iconSpacing })}
                  />
                  <Toggle
                    label={tr('显示卡片背景')}
                    checked={settings.showCardBackground}
                    onChange={(showCardBackground) => update({ showCardBackground })}
                  />
                  {settings.showCardBackground && (
                    <RangeSetting
                      label={tr('卡片透明度')}
                      value={settings.cardOpacity}
                      min={0.05}
                      max={0.95}
                      step={0.05}
                      format={(value) => `${Math.round(value * 100)}%`}
                      onChange={(cardOpacity) => update({ cardOpacity })}
                    />
                  )}
                  <Toggle
                    label={tr('折叠分类导航')}
                    checked={settings.navigationCollapsed}
                    onChange={(navigationCollapsed) => update({ navigationCollapsed })}
                  />
                </SettingsSection>
                <SettingsSection title={tr('外观')}>
                  <Segmented
                    label={tr('主题')}
                    value={settings.theme}
                    options={[
                      ['system', tr('跟随系统')],
                      ['light', tr('明亮')],
                      ['dark', tr('深色')],
                    ]}
                    onChange={(theme) => update({ theme: theme as SpaceSettings['theme'] })}
                  />
                  <div className="background-options">
                    {(['gradient', 'bing', 'unsplash', 'custom', 'color'] as const).map(
                      (background) => (
                        <button
                          key={background}
                          type="button"
                          className={`background-swatch background-preview-${background}`}
                          aria-pressed={settings.background === background}
                          onClick={() =>
                            update({
                              background,
                              ...(background === 'bing'
                                ? { onlineWallpaperUrl: bingDailyUrl }
                                : {}),
                              ...(background === 'unsplash'
                                ? {
                                    onlineWallpaperUrl: nextFeaturedPhoto(
                                      settings.onlineWallpaperUrl,
                                    ),
                                  }
                                : {}),
                            })
                          }
                        >
                          <span>
                            {tr(
                              {
                                gradient: '渐变',
                                bing: '每日图片',
                                unsplash: '精选摄影',
                                custom: '自定义',
                                color: '纯色',
                              }[background],
                            )}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                  {settings.background === 'gradient' && (
                    <div className="gradient-options" aria-label={tr('渐变背景')}>
                      {gradientPresets.map((gradient, index) => (
                        <button
                          type="button"
                          key={gradient}
                          style={{ backgroundImage: gradient }}
                          aria-label={`${tr('渐变背景')} ${index + 1}`}
                          aria-pressed={settings.gradient === gradient}
                          onClick={() => update({ gradient })}
                        />
                      ))}
                    </div>
                  )}
                  {settings.background === 'unsplash' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update({
                          onlineWallpaperUrl: nextFeaturedPhoto(settings.onlineWallpaperUrl),
                        })
                      }
                    >
                      {tr('换一张')}
                    </Button>
                  )}
                  {settings.background === 'color' && (
                    <label className="setting-row">
                      <span>{tr('背景颜色')}</span>
                      <input
                        type="color"
                        value={settings.solidColor}
                        onChange={(event) => update({ solidColor: event.target.value })}
                      />
                    </label>
                  )}
                  <label className="setting-row">
                    <span>{tr('遮罩强度')}</span>
                    <input
                      type="range"
                      min="0"
                      max="0.8"
                      step="0.05"
                      value={settings.overlay}
                      onChange={(event) => update({ overlay: Number(event.target.value) })}
                    />
                  </label>
                  {settings.background === 'custom' && (
                    <label className="setting-row">
                      <span>{tr('本地壁纸')}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void prepareImage(file, 'wallpaper')
                            .then(({ id, blob }) =>
                              dispatch(
                                {
                                  type: 'settings',
                                  spaceId,
                                  patch: {
                                    background: 'custom',
                                    wallpaperId: id,
                                    onlineWallpaperUrl: undefined,
                                  },
                                },
                                new Map([[id, blob]]),
                              ),
                            )
                            .catch((error: Error) => onError(error.message));
                        }}
                      />
                    </label>
                  )}
                  {settings.background === 'custom' && (
                    <form
                      className="online-wallpaper"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const url = String(new FormData(event.currentTarget).get('url')).trim();
                        try {
                          new URL(url);
                          update({
                            background: 'custom',
                            onlineWallpaperUrl: url,
                            wallpaperId: undefined,
                          });
                        } catch {
                          onError(tr('请输入有效的在线壁纸地址'));
                        }
                      }}
                    >
                      <input
                        name="url"
                        type="url"
                        aria-label={tr('在线壁纸地址')}
                        defaultValue={settings.onlineWallpaperUrl}
                        placeholder="https://example.com/wallpaper.jpg"
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {tr('使用在线壁纸')}
                      </Button>
                    </form>
                  )}
                  <TextColorSettings settings={settings} update={update} tr={tr} />
                </SettingsSection>
              </>
            )}
            {activeTab === 'preferences' && (
              <>
                <SettingsSection title={tr('组件')}>
                  <Toggle
                    label={tr('显示搜索')}
                    checked={settings.showSearch}
                    onChange={(showSearch) => update({ showSearch })}
                  />
                  <Toggle
                    label={tr('显示时钟')}
                    checked={settings.showClock}
                    onChange={(showClock) => update({ showClock })}
                  />
                  <Toggle
                    label={tr('显示日期')}
                    checked={settings.showDate}
                    onChange={(showDate) => update({ showDate })}
                  />
                  <Toggle
                    label={tr('显示农历')}
                    checked={settings.showLunar}
                    onChange={(showLunar) => update({ showLunar })}
                  />
                  <Toggle
                    label={tr('显示问候语')}
                    checked={settings.showGreeting}
                    onChange={(showGreeting) => update({ showGreeting })}
                  />
                  {settings.showGreeting && (
                    <div className="greeting-settings">
                      <p>{tr('可导入分时段的自定义问候语，导入后每天稳定轮换。')}</p>
                      <div className="data-actions">
                        <label className="file-button">
                          {tr('导入问候语')}
                          <input
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              void file
                                .text()
                                .then((content) => customGreetingsSchema.parse(JSON.parse(content)))
                                .then((customGreetings) => update({ customGreetings }))
                                .catch(() => onError(tr('问候语文件格式不正确')));
                            }}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => downloadGreetingTemplate(settings.language)}
                        >
                          {tr('下载模板')}
                        </Button>
                        {settings.customGreetings && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => update({ customGreetings: undefined })}
                          >
                            {tr('恢复默认')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <Toggle
                    label={tr('12 小时制')}
                    checked={settings.hour12}
                    onChange={(hour12) => update({ hour12 })}
                  />
                  <Toggle
                    label={tr('新标签页打开网站')}
                    checked={settings.openInNewTab}
                    onChange={(openInNewTab) => update({ openInNewTab })}
                  />
                  <Toggle
                    label={tr('显示分类导航')}
                    checked={settings.showCategories}
                    onChange={(showCategories) => update({ showCategories })}
                  />
                  <Toggle
                    label={tr('显示网站标题')}
                    checked={settings.showSiteTitle}
                    onChange={(showSiteTitle) => update({ showSiteTitle })}
                  />
                </SettingsSection>
                <SettingsSection title={tr('搜索引擎')}>
                  <SearchEngineSettings
                    settings={settings}
                    update={update}
                    onError={onError}
                    tr={tr}
                  />
                </SettingsSection>
                <SettingsSection title={tr('私密空间保护')}>
                  {!state.privateSecurity.protected ? (
                    <PasswordForm
                      label={tr('设置密码')}
                      submit={tr('启用密码保护')}
                      onSubmit={async (password) => {
                        await privateVault.protect(password);
                        onClose();
                      }}
                      onError={onError}
                      tr={tr}
                    />
                  ) : state.privateSecurity.locked ? (
                    <p className="settings-help">
                      {tr('私密空间已加密并锁定。进入私密空间解锁后可修改或取消密码。')}
                    </p>
                  ) : (
                    <>
                      <p className="settings-help">
                        {tr(
                          '私密网站、设置和图片已加密保存。返回普通空间或刷新页面会清除解锁状态。',
                        )}
                      </p>
                      <PasswordForm
                        label={tr('修改密码')}
                        submit={tr('更换密码')}
                        requireNext
                        onSubmit={async (current, next) => {
                          await privateVault.changePassword(current, next!);
                          onClose();
                        }}
                        onError={onError}
                        tr={tr}
                      />
                      <PasswordForm
                        label={tr('取消密码')}
                        submit={tr('取消密码保护')}
                        destructive
                        onSubmit={async (password) => {
                          await privateVault.removePassword(password);
                        }}
                        onError={onError}
                        tr={tr}
                      />
                    </>
                  )}
                </SettingsSection>
                {spaceId === 'private' && Object.keys(overrides).length > 0 && (
                  <SettingsSection title={tr('私密空间覆盖')}>
                    <p className="settings-help">
                      {tr('已覆盖')} {Object.keys(overrides).length}{' '}
                      {tr('项。可逐项恢复跟随普通空间。')}
                    </p>
                    <div className="override-list">
                      {(Object.keys(overrides) as (keyof SpaceSettings)[]).map((key) => (
                        <Button
                          key={key}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void dispatch({ type: 'reset-private-setting', key }).catch(
                              (error: Error) => onError(error.message),
                            )
                          }
                        >
                          <RotateCcw size={14} /> {tr(settingLabels[key] ?? key)}
                        </Button>
                      ))}
                    </div>
                  </SettingsSection>
                )}
              </>
            )}
            {activeTab === 'backup' && (
              <SettingsSection title={tr('数据')}>
                <DataSettings
                  state={state}
                  spaceId={spaceId}
                  language={settings.language}
                  onError={onError}
                />
              </SettingsSection>
            )}
            {activeTab === 'sync' && (
              <SettingsSection title={tr('同步')}>
                <SyncSettings language={settings.language} onError={onError} />
              </SettingsSection>
            )}
            <p className="settings-about">{tr('RayTab 0.1 · 数据默认保存在当前浏览器')}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="settings-buttons">
        {options.map(([option, text]) => (
          <button
            type="button"
            key={option}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextColorSettings({
  settings,
  update,
  tr,
}: {
  settings: SpaceSettings;
  update: (patch: Partial<SpaceSettings>) => void;
  tr: (text: string) => string;
}) {
  const targets: [keyof SpaceSettings['textColors'], string][] = [
    ['clock', '时钟'],
    ['date', '日期'],
    ['greeting', '问候语'],
    ['search', '搜索栏'],
    ['tabs', '分类标签'],
    ['cards', '网站卡片'],
  ];
  return (
    <div className="text-color-settings">
      <Segmented
        label={tr('主页文字')}
        value={settings.textColorMode}
        options={[
          ['auto', tr('自动适应')],
          ['light', tr('亮白')],
          ['dark', tr('墨黑')],
          ['custom', tr('自定义')],
        ]}
        onChange={(textColorMode) =>
          update({ textColorMode: textColorMode as SpaceSettings['textColorMode'] })
        }
      />
      {settings.textColorMode === 'custom' && (
        <div className="text-color-grid">
          {targets.map(([key, label]) => (
            <label key={key}>
              <span>{tr(label)}</span>
              <input
                type="color"
                value={settings.textColors[key]}
                onChange={(event) =>
                  update({ textColors: { ...settings.textColors, [key]: event.target.value } })
                }
              />
            </label>
          ))}
        </div>
      )}
      <p className="settings-help">
        {settings.textColorMode === 'auto'
          ? tr('纯色和渐变背景会按亮度自动选择文字，图片背景使用高对比亮白。')
          : tr('主页文字颜色会实时更新。')}
      </p>
    </div>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-range">
      <span>
        {label}
        <strong>{format ? format(value) : `${value}${suffix}`}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SearchEngineSettings({
  settings,
  update,
  onError,
  tr,
}: {
  settings: SpaceSettings;
  update: (patch: Partial<SpaceSettings>) => void;
  onError: (message: string) => void;
  tr: (text: string) => string;
}) {
  const remove = (id: string) => {
    if (settings.searchEngines.length === 1) {
      onError(tr('至少保留一个搜索引擎'));
      return;
    }
    const searchEngines = settings.searchEngines.filter((engine) => engine.id !== id);
    update({
      searchEngines,
      searchEngine: settings.searchEngine === id ? searchEngines[0].id : settings.searchEngine,
    });
  };
  return (
    <div className="search-engine-settings">
      <div className="search-engine-list">
        {settings.searchEngines.map((engine) => (
          <div key={engine.id}>
            <button
              type="button"
              className={settings.searchEngine === engine.id ? 'active' : ''}
              onClick={() => update({ searchEngine: engine.id })}
            >
              {engine.name}
            </button>
            <code>{engine.url}</code>
            <button
              type="button"
              aria-label={`${tr('删除')} ${engine.name}`}
              onClick={() => remove(engine.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <form
        className="search-engine-add"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const parsed = searchEngineSchema.safeParse({
            id: crypto.randomUUID(),
            name: String(data.get('name')),
            url: String(data.get('url')),
          });
          if (!parsed.success) {
            onError(tr(parsed.error.issues[0]?.message ?? '搜索引擎格式不正确'));
            return;
          }
          update({
            searchEngines: [...settings.searchEngines, parsed.data],
            searchEngine: parsed.data.id,
          });
          form.reset();
        }}
      >
        <input
          name="name"
          required
          maxLength={80}
          aria-label={tr('搜索引擎名称')}
          placeholder={tr('名称')}
        />
        <input
          name="url"
          required
          aria-label={tr('搜索引擎地址')}
          placeholder="https://example.com/search?q=%s"
        />
        <Button type="submit" variant="outline" size="sm">
          {tr('添加')}
        </Button>
      </form>
      <p className="settings-help">
        {tr('使用')} <code>%s</code> {tr('表示搜索关键词。')}
      </p>
    </div>
  );
}

function PasswordForm({
  label,
  submit,
  requireNext = false,
  destructive = false,
  onSubmit,
  onError,
  tr,
}: {
  label: string;
  submit: string;
  requireNext?: boolean;
  destructive?: boolean;
  onSubmit: (password: string, next?: string) => Promise<void>;
  onError: (message: string) => void;
  tr: (text: string) => string;
}) {
  return (
    <form
      className="password-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const password = String(data.get('password'));
        const next = requireNext ? String(data.get('next')) : undefined;
        if (next && next !== String(data.get('confirm'))) {
          onError(tr('两次输入的新密码不一致'));
          return;
        }
        void onSubmit(password, next)
          .then(() => form.reset())
          .catch((error: Error) => onError(error.message));
      }}
    >
      <strong>{label}</strong>
      <input
        name="password"
        type="password"
        minLength={6}
        required
        aria-label={tr(requireNext || destructive ? '当前密码' : '密码')}
        placeholder={requireNext || destructive ? tr('当前密码') : tr('至少 6 个字符')}
      />
      {requireNext && (
        <>
          <input
            name="next"
            type="password"
            minLength={6}
            required
            aria-label={tr('新密码')}
            placeholder={tr('新密码')}
          />
          <input
            name="confirm"
            type="password"
            minLength={6}
            required
            aria-label={tr('再次输入新密码')}
            placeholder={tr('再次输入新密码')}
          />
        </>
      )}
      <Button type="submit" variant={destructive ? 'destructive' : 'outline'} size="sm">
        {submit}
      </Button>
    </form>
  );
}
const settingLabels: Partial<Record<keyof SpaceSettings, string>> = {
  theme: '主题',
  searchEngine: '搜索引擎',
  searchEngines: '搜索引擎列表',
  openInNewTab: '打开方式',
  showClock: '时钟',
  showSearch: '搜索',
  showDate: '日期',
  showLunar: '农历',
  showGreeting: '问候语',
  customGreetings: '自定义问候语',
  showSiteTitle: '网站标题',
  showCategories: '分类导航',
  hour12: '时间制式',
  cardSize: '卡片大小',
  iconSizeRatio: '图标比例',
  maxCardsPerRow: '每行网站',
  iconSpacing: '图标间距',
  showCardBackground: '卡片背景',
  cardOpacity: '卡片透明度',
  navigationCollapsed: '分类导航',
  background: '背景',
  gradient: '渐变',
  solidColor: '纯色',
  wallpaperId: '壁纸',
  onlineWallpaperUrl: '在线壁纸',
  overlay: '遮罩',
  textColorMode: '主页文字',
  textColors: '自定义文字颜色',
};

function downloadGreetingTemplate(language: SpaceSettings['language']) {
  const template =
    language === 'en'
      ? {
          morning: ['Good morning.'],
          noon: ['Have a good afternoon.'],
          afternoon: ['Keep going.'],
          evening: ['Good evening.'],
          night: ['It is late. Get some rest.'],
        }
      : {
          morning: ['早上好，开启新的一天'],
          noon: ['中午好，记得好好吃饭'],
          afternoon: ['下午好，继续加油'],
          evening: ['晚上好，放松一下吧'],
          night: ['夜深了，早点休息哦'],
        };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'raytab-greetings.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
