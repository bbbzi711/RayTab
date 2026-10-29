import { describe, expect, it } from 'vitest';

import { findCatalogIcon } from '../../src/features/navigation/brand-catalog';
import { getBrandAppearance } from '../../src/features/navigation/brandIcons';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import index from '../../src/features/navigation/assets/brand-index.json';

describe('bundled community catalog', () => {
  it('covers all verified regional application domains without substituting their parent brand', async () => {
    const apps = JSON.parse(await readFile('scripts/app-brand-sources.json', 'utf8')) as {
      title: string;
      hostname: string;
    }[];
    for (const app of apps) {
      const icon = findCatalogIcon(`https://${app.hostname}`)!;
      expect(icon, app.hostname).toBeDefined();
      expect(icon.hostname, app.hostname).toBe(app.hostname);
      expect(getBrandAppearance(`https://${app.hostname}`), app.hostname).not.toBeNull();
    }
    expect(findCatalogIcon('https://qq.com')).toBeUndefined();
    expect(getBrandAppearance('https://baidu.com')).not.toBeNull();
  });
  it('maps application aliases to their brand and keeps product subdomains separate', () => {
    expect(findCatalogIcon('https://douyin.com')).toEqual(findCatalogIcon('https://tiktok.com'));
    const music = findCatalogIcon('https://music.youtube.com');
    expect(music?.hostname).toBe('music.youtube.com');
    expect(music).not.toEqual(findCatalogIcon('https://youtube.com'));
    expect(findCatalogIcon('https://tieba.baidu.com')?.hostname).toBe('tieba.baidu.com');
    expect(getBrandAppearance('https://tieba.baidu.com.example.com')).toBeNull();
  });
  it('covers the full checked-in index with local, hash-verified assets and provenance', async () => {
    const snapshot = JSON.parse(await readFile('public/brand-icons/catalog.json', 'utf8')) as {
      entries: {
        hostname: string;
        pathname: string;
        light: { file: string; sha256: string };
        dark?: { file: string; sha256: string };
      }[];
    };
    expect(
      index.map((entry) => [
        entry.hostname,
        entry.pathname,
        entry.light,
        entry.dark ?? entry.light,
      ]),
    ).toEqual(
      snapshot.entries.map((entry) => [
        entry.hostname,
        entry.pathname,
        entry.light.file,
        entry.dark?.file ?? entry.light.file,
      ]),
    );
    const assets = new Map(
      snapshot.entries
        .flatMap((entry) => [entry.light, ...(entry.dark ? [entry.dark] : [])])
        .map((asset) => [asset.file, asset]),
    );
    await Promise.all(
      [...assets.values()].map(async ({ file, sha256 }) => {
        const bytes = await readFile(`public/brand-icons/${file}`);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
        expect(bytes.length, file).toBeGreaterThan(0);
        if (file.endsWith('.svg'))
          expect(bytes.toString()).not.toMatch(
            /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=/i,
          );
        else if (file.endsWith('.png')) {
          expect(bytes.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
          expect(Math.min(bytes.readUInt32BE(16), bytes.readUInt32BE(20))).toBeGreaterThanOrEqual(
            64,
          );
        } else if (file.endsWith('.ico')) {
          expect(bytes.readUInt32LE(0)).toBe(65536);
          expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('matches product paths and exact domains, preserves full-color assets, and never matches suffix lookalikes', () => {
    expect(findCatalogIcon('https://www.figma.com/design')?.hostname).toBe('figma.com');
    expect(findCatalogIcon('https://chatgpt.com')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://chatgpt.com/codex')?.title).toBe('OpenAI');
    expect(findCatalogIcon('https://openai.com/codex')?.title).toBe('Codex');
    expect(findCatalogIcon('https://gemini.google.com/app')?.title).toBe('Gemini');
    expect(findCatalogIcon('https://figma.com.example.com')).toBeUndefined();
    expect(findCatalogIcon('https://example.com/figma.com')).toBeUndefined();
  });
});
