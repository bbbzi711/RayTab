import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import { SiteTitle } from '@/features/navigation/NavigationCards';
import { SiteIcon } from '@/features/navigation/SiteIcon';
import type { SpaceId, SpaceSettings } from '@/storage/model';
import { useRayTabStore } from '@/storage/store';

export function SettingsPreview({
  settings,
  spaceId,
}: {
  settings: SpaceSettings;
  spaceId: SpaceId;
}) {
  const { t } = useTranslation();
  const sites = useRayTabStore(
    useShallow((store) => {
      const space = store.state?.spaces[spaceId];
      const groupId = store.state?.local.activeGroup[spaceId] ?? space?.groups[0]?.id;
      const rootSites = space?.sites.filter((site) => site.folderId === null) ?? [];
      const groupSites = rootSites.filter((site) => site.groupId === groupId);
      return (groupSites.length ? groupSites : rootSites)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .slice(0, 12);
    }),
  );
  const previewSites = sites.length
    ? sites
    : [
        {
          id: 'sample',
          title: t('settings.exampleSite'),
          url: '',
          icon: { source: 'text', text: 'R' },
          iconBackground: { mode: 'auto' },
        } as const,
      ];
  const columns = Math.min(previewSites.length, settings.maxCardsPerRow);
  const layout = {
    '--site-icon-size': `${settings.cardSize * settings.iconSizeRatio * 0.55}px`,
    '--site-icon-radius': `${settings.iconRadius}%`,
    gridTemplateColumns: `repeat(${columns}, minmax(0, ${settings.cardSize * 0.56}px))`,
    gap: Math.min(10, settings.iconSpacing * 0.25),
    color: resolveHomeTextColors(settings).cards,
  } as CSSProperties;

  return (
    <figure className="settings-preview">
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground">
        {t('settings.liveAppearance')}
      </figcaption>
      <div className="settings-wallpaper relative isolate grid min-h-28 content-center overflow-hidden rounded-lg sm:min-h-38">
        <div className="page-background-image" aria-hidden="true" />
        <div className="page-background-overlay" aria-hidden="true" />
        <div className="relative grid w-full justify-center p-3" style={layout}>
          {previewSites.map((site) => (
            <div key={site.id} className="flex min-w-0 flex-col items-center text-center">
              <SiteIcon site={site} />
              {settings.showSiteTitle && <SiteTitle title={site.title} />}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
