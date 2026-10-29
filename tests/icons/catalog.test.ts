import { afterEach, describe, expect, it, vi } from 'vitest';

import { findCatalogIcon } from '../../src/features/navigation/brand-catalog';
import { getBrandAppearance } from '../../src/features/navigation/brandIcons';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import index from '../../src/features/navigation/assets/brand-index.json';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bundled community catalog', () => {
  it('covers all verified regional application domains without substituting their parent brand', async () => {
    const apps = JSON.parse(await readFile('scripts/app-brand-sources.json', 'utf8')) as {
      title: string;
      hostname: string;
    }[];
    for (const app of apps) {
      const icon = findCatalogIcon(`https://${app.hostname}`)!;
      expect(icon.title).toBe(app.title);
      expect(icon.tile).toBe(true);
      expect(icon.light).toMatch(/^\/brand-icons\/[a-f\d]+\.(?:png|ico)$/);
      expect(getBrandAppearance(`https://${app.hostname}`), app.hostname).not.toBeNull();
    }
    expect(findCatalogIcon('https://qq.com')).toBeUndefined();
    expect(getBrandAppearance('https://baidu.com')?.tile).not.toBe(true);
  });
  it('uses the full-color TikTok mark and product-specific logos before generic parent brands', () => {
    const tiktok = findCatalogIcon('https://tiktok.com')!;
    expect(renderToStaticMarkup(getBrandAppearance('https://douyin.com')!.graphic)).toContain(
      tiktok.light,
    );
    const music = findCatalogIcon('https://music.youtube.com')!;
    expect(music.title).toBe('Youtube Music');
    expect(
      renderToStaticMarkup(getBrandAppearance('https://music.youtube.com')!.graphic),
    ).toContain(music.light);
    const tieba = getBrandAppearance('https://tieba.baidu.com')!;
    expect(tieba.tile).toBe(true);
    expect(renderToStaticMarkup(tieba.graphic)).toContain(
      findCatalogIcon('https://tieba.baidu.com')!.light,
    );
    expect(getBrandAppearance('https://tieba.baidu.com.example.com')).toBeNull();
  });
  it('covers the full checked-in index with local, hash-verified assets and provenance', async () => {
    const snapshot = JSON.parse(await readFile('public/brand-icons/catalog.json', 'utf8')) as {
      entries: {
        light: { file: string; sha256: string };
        dark?: { file: string; sha256: string };
      }[];
    };
    expect(snapshot.entries).toHaveLength(index.length);
    const assets = new Map(
      snapshot.entries
        .flatMap((entry) => [entry.light, ...(entry.dark ? [entry.dark] : [])])
        .map((asset) => [asset.file, asset]),
    );
    await Promise.all(
      [...assets.values()].map(async ({ file, sha256 }) => {
        const bytes = await readFile(`public/brand-icons/${file}`);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
        if (file.endsWith('.svg'))
          expect(bytes.toString()).not.toMatch(
            /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=/i,
          );
        else if (file.endsWith('.png')) {
          expect(bytes.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
          expect(Math.min(bytes.readUInt32BE(16), bytes.readUInt32BE(20))).toBeGreaterThanOrEqual(
            64,
          );
        } else {
          expect(bytes.readUInt32LE(0)).toBe(65536);
          expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('matches product paths and exact domains, preserves full-color assets, and never matches suffix lookalikes', () => {
    expect(findCatalogIcon('https://www.figma.com/design')?.light).toMatch(
      /^\/brand-icons\/.*\.svg$/,
    );
    expect(findCatalogIcon('https://chatgpt.com')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://chatgpt.com/codex')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://openai.com/codex')?.title).toBe('Codex');
    expect(findCatalogIcon('https://gemini.google.com/app')?.title).toBe('Gemini');
    expect(findCatalogIcon('https://figma.com.example.com')).toBeUndefined();
    expect(findCatalogIcon('https://example.com/figma.com')).toBeUndefined();
  });
});
