import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const pnpmPath = process.env.npm_execpath;
if (!pnpmPath) throw new Error('Run this script through pnpm.');
const args = ['list', '--prod', '--depth', 'Infinity', '--json'];
const projects = JSON.parse(
  execFileSync(
    /\.[cm]?js$/i.test(pnpmPath) ? process.execPath : pnpmPath,
    /\.[cm]?js$/i.test(pnpmPath) ? [pnpmPath, ...args] : args,
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ),
);
const packages = new Map();
async function collect(node, manifest) {
  for (const group of [node.dependencies, node.optionalDependencies])
    for (const [name, info] of Object.entries(group ?? {})) {
      if (packages.has(info.path)) continue;
      let packageManifest;
      try {
        packageManifest = JSON.parse(await readFile(path.join(info.path, 'package.json'), 'utf8'));
      } catch (error) {
        // pnpm list includes platform-specific optional packages even when they
        // were not installed. Read the parent's manifest because list can place
        // optional packages in its generic dependencies group.
        const optional =
          Object.hasOwn(manifest.optionalDependencies ?? {}, name) ||
          manifest.peerDependenciesMeta?.[name]?.optional === true;
        if (optional && error.code === 'ENOENT') continue;
        throw error;
      }
      packages.set(info.path, packageManifest);
      await collect(info, packageManifest);
    }
}
const projectManifest = JSON.parse(await readFile('package.json', 'utf8'));
for (const project of projects) await collect(project, projectManifest);
const sections = [
  'RayTab third-party notices\n\nThe following packages retain their respective licenses and copyright notices.',
];
sections.push(
  'shadcn/ui components\n\n' + (await readFile('third-party/shadcn-ui-LICENSE.txt', 'utf8')),
);
sections.push(
  'SVGL community asset catalog\n\n' +
    (await readFile('third-party/svgl-LICENSE.txt', 'utf8')) +
    '\nLogos and trademarks belong to their respective owners; see the bundled brand-icons/catalog.json for source and brand guidelines.',
);
sections.push(
  'Official application artwork\n\nApplication logos and trademarks belong to their respective publishers. The bundled brand-icons/catalog.json records the verified package name, publisher, app-store metadata page, original image URL and SHA-256. These assets are not relicensed as SVGL artwork.',
);
for (const directory of [...packages.keys()].sort()) {
  const info = packages.get(directory);
  const licenses = (await readdir(directory)).filter((name) =>
    /^(licen[sc]e|copying|notice)(\.|$)/i.test(name),
  );
  if (!licenses.length && info.name === 'react-remove-scroll-bar') {
    sections.push(
      `${info.name} ${info.version}\n\n` +
        (await readFile('third-party/react-remove-scroll-bar-LICENSE.txt', 'utf8')),
    );
    continue;
  }
  if (!licenses.length) throw new Error(`Missing license text for ${directory}`);
  sections.push(
    `${info.name} ${info.version}\nLicense: ${info.license ?? 'See below'}\n\n` +
      (
        await Promise.all(licenses.map((name) => readFile(path.join(directory, name), 'utf8')))
      ).join('\n\n'),
  );
}
sections.push('tailwindcss\n\n' + (await readFile('node_modules/tailwindcss/LICENSE', 'utf8')));
sections.push(
  'tw-animate-css\n\n' + (await readFile('node_modules/tw-animate-css/LICENSE', 'utf8')),
);
await writeFile('public/THIRD_PARTY_NOTICES.txt', sections.join('\n\n' + '='.repeat(72) + '\n\n'));
await writeFile('public/PRIVACY.md', await readFile('PRIVACY.md', 'utf8'));
