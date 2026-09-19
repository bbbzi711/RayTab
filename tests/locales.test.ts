import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../src/locales';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(path)) ? [path] : [];
  });
}

describe('interface translations', () => {
  it('has an English translation for every Chinese literal passed to tr', () => {
    const missing = new Set<string>();
    for (const path of sourceFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/tr\('([^']+)'\)/g)) {
        const key = match[1];
        if (/\p{Script=Han}/u.test(key) && t('en', key) === key) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('translates errors that include runtime details', () => {
    expect(t('en', '备份需要的资源 image-1 不存在')).toBe(
      'Required backup resource image-1 is missing',
    );
    expect(t('en', '远端服务返回 503')).toBe('The remote service returned 503');
  });
});
