import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n from '@/locales';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : ['.ts', '.tsx'].includes(extname(path))
        ? [path]
        : [];
  });
}

describe('interface translations', () => {
  it('has Chinese and English resources for every static product translation key', () => {
    const missing: string[] = [];
    for (const path of sourceFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(
        /['"]((?:messages|errors|navigation|settings|clock|onboarding|errorBoundary|popup|counts)\.[\w.]+)['"]/g,
      )) {
        if (match[1].endsWith('.')) continue;
        for (const language of ['zh-CN', 'en'])
          if (
            !i18n.exists(match[1], { lng: language, fallbackLng: false, count: 1 }) &&
            !i18n.exists(match[1], { lng: language, fallbackLng: false })
          )
            missing.push(`${language}: ${match[1]} (${path})`);
      }
      expect(source, path).not.toMatch(/\btr\(['"][^'"]*[\p{Script=Han}][^'"]*['"]/u);
    }
    expect(missing).toEqual([]);
  });
});
