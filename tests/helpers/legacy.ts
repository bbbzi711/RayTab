import { createInitialState } from '../../src/storage/model';

export function createLegacyV4State() {
  const current = createInitialState();
  const { iconRadius, ...normalSettings } = current.normalSettings;
  const space = (id: 'normal' | 'private') => ({
    ...current.spaces[id],
    sites: current.spaces[id].sites.map(({ icon, iconBackground, ...site }) => ({
      ...site,
      color: iconBackground.mode === 'color' ? iconBackground.color : '#123456',
      iconId: 'resourceId' in icon ? icon.resourceId : undefined,
    })),
  });
  return {
    ...current,
    schemaVersion: 4 as const,
    normalSettings: {
      ...normalSettings,
      showGroups: true,
      showCardBackground: false,
      cardOpacity: 0.2,
      navigationCollapsed: false,
    },
    spaces: { normal: space('normal'), private: space('private') },
  };
}

export function legacyNavigation(
  space: ReturnType<typeof createLegacyV4State>['spaces']['normal'],
) {
  return { ...space, sites: space.sites.map(({ color, iconId, ...site }) => site) };
}
