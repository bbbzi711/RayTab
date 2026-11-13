import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { SpaceSettings } from '@/storage/model';
import { gradientPresets, nextFeaturedPhoto } from '@/features/appearance/wallpapers';
import { LocalWallpaperForm, WallpaperForm, type SaveSettings } from './SettingsForms';
import { SettingsSelect, type DraftReporter } from './SettingsControls';

export function WallpaperSettings({
  settings,
  savedUrl,
  save,
  report,
  onUpdate,
  onPreview,
}: {
  settings: SpaceSettings;
  savedUrl?: string;
  save: SaveSettings;
  report: DraftReporter;
  onUpdate: (patch: Partial<SpaceSettings>) => void;
  onPreview: (patch: Partial<SpaceSettings>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'local' | 'online'>(() =>
    settings.onlineWallpaperUrl && !settings.wallpaperId ? 'online' : 'local',
  );
  const sourceLabel =
    settings.background === 'custom'
      ? settings.wallpaperId
        ? t('settings.localWallpaper')
        : settings.onlineWallpaperUrl
          ? t('settings.wallpaperEditor.onlineImage')
          : t('settings.wallpaperEditor.defaultImage')
      : t('settings.backgrounds.' + settings.background);

  return (
    <details
      className="settings-wallpaper-editor"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        role="button"
        aria-label={t('settings.wallpaperEditor.change')}
        aria-expanded={open}
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg py-3"
      >
        {/* Reuse the renderer's current image, including its local cache and live previews. */}
        <span className="settings-wallpaper-preview" aria-hidden="true" />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="text-sm font-medium">{t('settings.wallpaperEditor.current')}</span>
          <span className="truncate text-xs text-muted-foreground" title={sourceLabel}>
            {sourceLabel}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
          {t('settings.wallpaperEditor.change')}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </span>
      </summary>
      <div className="grid min-w-0 gap-3 pb-2">
        <SettingsSelect
          label={t('settings.wallpaperSource')}
          value={settings.background}
          options={['gradient', 'bing', 'unsplash', 'custom', 'color'].map(
            (value) => [value, t('settings.backgrounds.' + value)] as const,
          )}
          onChange={(value) => onUpdate({ background: value as SpaceSettings['background'] })}
        />
        {settings.background === 'gradient' && (
          <div className="gradient-options" aria-label={t('settings.gradient')}>
            {gradientPresets.map((gradient, index) => (
              <button
                type="button"
                key={gradient}
                style={{ backgroundImage: gradient }}
                aria-label={t('settings.gradientNamed', { number: index + 1 })}
                aria-pressed={settings.gradient === gradient}
                onClick={() => onUpdate({ gradient })}
              />
            ))}
          </div>
        )}
        {settings.background === 'unsplash' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              onUpdate({ featuredPhotoUrl: nextFeaturedPhoto(settings.featuredPhotoUrl) })
            }
          >
            {t('settings.nextPhoto')}
          </Button>
        )}
        {settings.background === 'color' && (
          <div className="setting-row">
            <label htmlFor="settings-solid-color">{t('settings.fields.solidColor')}</label>
            <input
              id="settings-solid-color"
              className="settings-color-input"
              type="color"
              value={settings.solidColor}
              onChange={(event) => onPreview({ solidColor: event.target.value })}
              onBlur={(event) => onUpdate({ solidColor: event.target.value })}
            />
          </div>
        )}
        <div className="settings-panel-content" hidden={settings.background !== 'custom'}>
          <div
            className="mb-4 flex flex-wrap gap-2"
            role="group"
            aria-label={t('settings.wallpaperEditor.imageSource')}
          >
            {(['local', 'online'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={method === value ? 'secondary' : 'ghost'}
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
              >
                {t('settings.wallpaperEditor.' + value)}
              </Button>
            ))}
          </div>
          {/* Keep both forms mounted: changing source or collapsing must not discard a draft. */}
          <div className="settings-panel-content" hidden={method !== 'local'}>
            <LocalWallpaperForm save={save} report={report} />
          </div>
          <div className="settings-panel-content" hidden={method !== 'online'}>
            <WallpaperForm url={savedUrl} save={save} report={report} />
          </div>
        </div>
      </div>
    </details>
  );
}
