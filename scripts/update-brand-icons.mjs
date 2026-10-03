import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Explicit maintenance command; ordinary builds and extension startup never call the catalog API.
const appsOnly = process.argv.includes('--apps-only');
const previous = appsOnly
  ? JSON.parse(await readFile('public/brand-icons/catalog.json', 'utf8'))
  : undefined;
const catalog = appsOnly
  ? []
  : await fetch('https://api.svgl.app').then((response) => {
      if (!response.ok) throw new Error(`SVGL catalog: ${response.status}`);
      return response.json();
    });
const directory = 'public/brand-icons';
await mkdir(directory, { recursive: true });
const entries = previous?.entries.filter((entry) => !entry.packageName) ?? [];
const rejected = previous?.rejected ?? [];
let cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < catalog.length) {
      const item = catalog[cursor++];
      const website = new URL(item.url);
      if (website.protocol !== 'https:') continue;
      const variants = typeof item.route === 'string' ? { light: item.route } : item.route;
      const files = {};
      let invalid = false;
      for (const [variant, source] of Object.entries(variants)) {
        const asset = new URL(source);
        if (asset.origin !== 'https://svgl.app' || !asset.pathname.endsWith('.svg'))
          throw new Error(`Unexpected catalog asset: ${source}`);
        const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`SVGL asset: ${response.status} ${source}`);
        // Normalize before hashing so Git checkouts preserve identical bytes on every platform.
        const svg = (await response.text()).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
        // SVGs remain image resources, with no executable or remote dependencies.
        if (
          !svg.includes('<svg') ||
          /<(?:script|foreignObject|iframe)\b|\bon\w+\s*=|<!ENTITY|@import/i.test(svg) ||
          /(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)[^"']+/i.test(svg) ||
          /url\(\s*["']?(?!#)[^)]/i.test(svg)
        ) {
          rejected.push({ title: item.title, source, reason: 'SVG is not self-contained' });
          invalid = true;
          break;
        }
        const hash = createHash('sha256').update(svg).digest('hex');
        const file = `${hash}.svg`;
        await writeFile(`${directory}/${file}`, svg);
        files[variant] = { file, source, sha256: hash };
      }
      if (!invalid)
        entries.push({
          title: item.title,
          hostname: website.hostname.replace(/^www\./, '').toLowerCase(),
          pathname: website.pathname.replace(/\/$/, '') || '/',
          website: item.url,
          brandUrl: item.brandUrl,
          ...files,
        });
    }
  }),
);
// Official app-store artwork fills regional gaps in SVGL. This is a maintenance-time
// lookup, never a request from a user's new tab or private space.
const apps = JSON.parse(await readFile('scripts/app-brand-sources.json', 'utf8'));
const downloadedApps = new Map();
function findApp(value, packageName) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.pkg_name === packageName && typeof value.icon === 'string') return value;
  for (const child of Object.values(value)) {
    const app = findApp(child, packageName);
    if (app) return app;
  }
}
async function appAsset({ packageName, iconSource }) {
  const page = `https://sj.qq.com/appdetail/${packageName}`;
  const response = await fetch(page, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`App metadata: ${response.status} ${page}`);
  const html = await response.text();
  const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const app = data && findApp(JSON.parse(data).props?.pageProps, packageName);
  if (!app) throw new Error(`No matching app metadata: ${packageName}`);
  const source = new URL(iconSource ?? app.icon);
  source.protocol = 'https:';
  if (!iconSource && source.hostname !== 'pp.myapp.com')
    throw new Error(`Unexpected app image: ${source}`);
  const image = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!image.ok) throw new Error(`App image: ${image.status} ${source}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  // Original website marks can be preferable to high-resolution seasonal app ads.
  let extension;
  let width;
  let height;
  if (bytes.length >= 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    extension = 'png';
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes.length >= 22 && bytes.readUInt32LE(0) === 65536) {
    extension = 'ico';
    const count = bytes.readUInt16LE(4);
    if (bytes.length < 6 + count * 16) throw new Error(`Invalid ICO: ${source}`);
    const sizes = Array.from({ length: count }, (_, i) => ({
      width: bytes[6 + i * 16] || 256,
      height: bytes[7 + i * 16] || 256,
    }));
    ({ width, height } =
      sizes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))[0] ?? {});
  }
  if (!extension || Math.min(width, height) < (iconSource ? 64 : 128))
    throw new Error(`Expected original usable brand image: ${source}`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const file = `${hash}.${extension}`;
  await writeFile(`${directory}/${file}`, bytes);
  return {
    title: app.name,
    developer: app.developer,
    metadataSource: page,
    width,
    height,
    light: { file, source: source.href, sha256: hash },
  };
}
cursor = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < apps.length) {
      const item = apps[cursor++];
      if (!downloadedApps.has(item.packageName))
        downloadedApps.set(item.packageName, appAsset(item));
      const asset = await downloadedApps.get(item.packageName);
      entries.push({
        ...asset,
        ...item,
        pathname: '/',
        website: `https://${item.hostname}`,
        tile: true,
      });
    }
  }),
);
entries.sort(
  (a, b) =>
    a.hostname.localeCompare(b.hostname) ||
    b.pathname.length - a.pathname.length ||
    Number(Boolean(b.tile)) - Number(Boolean(a.tile)) ||
    a.title.localeCompare(b.title),
);
const snapshot = {
  source: 'https://api.svgl.app',
  applicationSource: 'https://sj.qq.com',
  entries,
  rejected,
};
await writeFile(`${directory}/catalog.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeFile(
  'src/features/navigation/assets/brand-index.json',
  `${JSON.stringify(
    entries.map(({ title, hostname, pathname, light, dark, tile, cover, width, height }) => ({
      title,
      hostname,
      pathname,
      light: light.file,
      dark: dark?.file,
      tile: Boolean(tile),
      ...(cover ? { cover: true } : {}),
      ...(tile ? { width, height } : {}),
    })),
    null,
    2,
  )}\n`,
);
const retained = new Set(
  entries.flatMap((item) => [item.light.file, item.dark?.file].filter(Boolean)),
);
for (const file of await readdir(directory))
  if (/^[a-f\d]{64}\.(?:svg|png|ico)$/.test(file) && !retained.has(file))
    await unlink(`${directory}/${file}`);
if (!appsOnly) {
  const license = await fetch('https://raw.githubusercontent.com/pheralb/svgl/main/LICENSE').then(
    (r) => {
      if (!r.ok) throw new Error(`SVGL license: ${r.status}`);
      return r.text();
    },
  );
  await writeFile('third-party/svgl-LICENSE.txt', license);
}
console.log(
  `Brands: ${entries.length} entries including ${apps.length} app domains, ${rejected.length} non-self-contained assets excluded.`,
);
