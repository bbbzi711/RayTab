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
  const sourceLabel =
    settings.background === 'custom'
      ? settings.wallpaperId
        ? t('settings.localWallpaper')
        : settings.onlineWallpaperUrl
          ? t('settings.wallpaperEditor.onlineImage')
          : t('settings.wallpaperEditor.defaultImage')
      : t('settings.backgrounds.' + settings.background);

  return (
    <div className="grid min-w-0 gap-3 py-2">
      <div className="settings-wallpaper-current flex min-w-0 items-center gap-3">
        {/* Reuse the renderer's current image, including its local cache and live previews. */}
        <span className="settings-wallpaper-preview" aria-hidden="true" />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="text-sm font-medium">{t('settings.wallpaperEditor.current')}</span>
          <span className="truncate text-xs text-muted-foreground" title={sourceLabel}>
            {sourceLabel}
          </span>
        </span>
      </div>
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
      <div
        className="settings-panel-content grid min-w-0 gap-4"
        hidden={settings.background !== 'custom'}
      >
        <LocalWallpaperForm save={save} report={report} />
        <WallpaperForm url={savedUrl} save={save} report={report} />
      </div>
    </div>
  );
}
