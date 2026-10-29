import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '@/locales';
import { AppError, errorMessage, serializeError, storedErrorMessage } from '@/lib/errors';

afterEach(async () => {
  await i18n.changeLanguage('zh-CN');
});

function leaves(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object')
    return [prefix.replace(/_(one|other|zero|two|few|many)$/, '')];
  return Object.entries(value).flatMap(([key, item]) =>
    leaves(item, prefix ? `${prefix}.${key}` : key),
  );
}

describe('internationalization resources and business error boundaries', () => {
  it('maintains matching Chinese and English semantic resources', () => {
    const root = resolve('src/locales/resources');
    const pairs = [
      ['zh-CN.json', 'en.json'],
      ...readdirSync(root)
        .filter((file) => file.endsWith('.zh-CN.json'))
        .map((file) => [file, file.replace('.zh-CN.json', '.en.json')]),
    ];
    for (const [chinese, english] of pairs) {
      const keys = (name: string) =>
        [...new Set(leaves(JSON.parse(readFileSync(resolve(root, name), 'utf8'))))].sort();
      expect(keys(english), english).toEqual(keys(chinese));
    }
  });
  it('translates a persisted dynamic failure again after changing language', async () => {
    const stored = serializeError(new AppError('errors.remoteStatus', { status: 503 }));
    expect(stored).toEqual({ code: 'errors.remoteStatus', values: { status: 503 } });
    expect(storedErrorMessage(stored)).toBe('远端服务返回 503');
    await i18n.changeLanguage('en');
    expect(storedErrorMessage(stored)).toBe('The remote service returned 503');
    expect(errorMessage(new AppError('errors.missingBackupResource', { id: 'icon-42' }))).toBe(
      'Required backup resource icon-42 is missing',
    );
  });
  it('uses native interpolation and English plural forms', async () => {
    expect(i18n.t('counts.sites', { count: 2 })).toBe('2 个网站');
    await i18n.changeLanguage('en');
    expect(i18n.t('counts.sites', { count: 1 })).toBe('1 site');
    expect(i18n.t('counts.sites', { count: 2 })).toBe('2 sites');
  });
  it('retains unknown external diagnostics without treating them as translation keys', async () => {
    await i18n.changeLanguage('en');
    expect(errorMessage(new Error('DNS lookup failed'))).toBe(
      'An error occurred. Try again. (DNS lookup failed)',
    );
  });
});
