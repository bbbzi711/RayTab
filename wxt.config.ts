import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ manifestVersion }) => ({
    default_locale: 'zh_CN',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    permissions: ['storage', 'alarms', 'activeTab'],
    ...(manifestVersion === 3
      ? {
          optional_permissions: ['bookmarks'],
          optional_host_permissions: ['https://*/*', 'http://*/*'],
        }
      : { optional_permissions: ['bookmarks', 'https://*/*', 'http://*/*'] }),
    browser_specific_settings: {
      gecko: {
        id: 'raytab@raytab.app',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
          optional: ['authenticationInfo', 'bookmarksInfo', 'websiteActivity'],
        },
      },
    },
    commands: {
      'open-raytab': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: '__MSG_openRayTab__',
      },
    },
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  zip: {
    excludeSources: ['docs/plan/**', 'dist/**', 'artifacts/**', '.output/**'],
  },
});
