import { cp, lstat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.output');
const destination = path.join(root, 'dist');
if (path.dirname(destination) !== root || path.basename(destination) !== 'dist') {
  throw new Error('Build output must remain inside the project dist directory.');
}
const existing = await lstat(destination).catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (existing?.isSymbolicLink()) throw new Error('Refusing to replace a linked dist directory.');
await lstat(source);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
