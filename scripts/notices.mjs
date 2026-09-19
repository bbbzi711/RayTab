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
function collect(node) {
  for (const group of [node.dependencies, node.optionalDependencies])
    for (const info of Object.values(group ?? {})) {
      if (packages.has(info.path)) continue;
      packages.set(info.path, info);
      collect(info);
    }
}
for (const project of projects) collect(project);
const sections = [
  'RayTab third-party notices\n\nThe following packages retain their respective licenses and copyright notices.',
];
sections.push(
  'shadcn/ui components\n\n' + (await readFile('third-party/shadcn-ui-LICENSE.txt', 'utf8')),
);
for (const directory of [...packages.keys()].sort()) {
  const info = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
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
