import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './resources/zh-CN.json';
import en from './resources/en.json';
import coreZh from './resources/core.zh-CN.json';
import coreEn from './resources/core.en.json';
import navigationZh from './resources/navigation.zh-CN.json';
import navigationEn from './resources/navigation.en.json';
import settingsZh from './resources/settings.zh-CN.json';
import settingsEn from './resources/settings.en.json';
import type { SpaceSettings } from '@/storage/model';

export type Language = SpaceSettings['language'];

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: { ...zhCN, ...coreZh, ...navigationZh, settings: settingsZh } },
    en: { translation: { ...en, ...coreEn, ...navigationEn, settings: settingsEn } },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en'],
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
});

export default i18n;
