import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
function crc(data) {
  let c = 0xffffffff;
  for (const v of data) {
    c ^= v;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, sum]);
}
const markSize = 32;
const center = markSize / 2;
const sunRadius = 5.75;
const rayStart = 8.35;
const rayEnd = 12;
const rayRadius = 1.1;
const rayDirections = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
});
const foreground = [255, 255, 255];
const background = [37, 99, 235];
const sampleGrid = 4;

function isSunPixel(x, y) {
  if (x * x + y * y <= sunRadius ** 2) return true;
  return rayDirections.some(([dx, dy]) => {
    const projection = Math.max(rayStart, Math.min(rayEnd, x * dx + y * dy));
    return (x - dx * projection) ** 2 + (y - dy * projection) ** 2 <= rayRadius ** 2;
  });
}

function samplePixel(column, row, size) {
  const scale = markSize / size;
  let coverage = 0;
  let markCoverage = 0;
  for (let dy = 0; dy < sampleGrid; dy++) {
    for (let dx = 0; dx < sampleGrid; dx++) {
      const x = (column + (dx + 0.5) / sampleGrid) * scale - center;
      const y = (row + (dy + 0.5) / sampleGrid) * scale - center;
      const cornerX = Math.max(0, Math.abs(x) - 8);
      const cornerY = Math.max(0, Math.abs(y) - 8);
      if (Math.hypot(cornerX, cornerY) > 7) continue;
      coverage++;
      if (isSunPixel(x, y)) markCoverage++;
    }
  }
  if (!coverage) return [0, 0, 0, 0];
  const fraction = markCoverage / coverage;
  const channels = background.map((value, i) =>
    Math.round(value + (foreground[i] - value) * fraction),
  );
  return [...channels, Math.round((coverage * 255) / (sampleGrid * sampleGrid))];
}

const rays = rayDirections
  .map(([dx, dy]) => {
    const start = [dx, dy].map((direction) => (center + direction * rayStart).toFixed(3));
    const end = [dx, dy].map((direction) => (center + direction * rayEnd).toFixed(3));
    return `M${start.join(' ')}L${end.join(' ')}`;
  })
  .join('');

mkdirSync('public/icons', { recursive: true });
writeFileSync(
  'public/icons/raytab.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markSize} ${markSize}">
  <circle cx="${center}" cy="${center}" r="${sunRadius}"/>
  <path d="${rays}" fill="none" stroke="#000" stroke-width="${rayRadius * 2}" stroke-linecap="round"/>
</svg>
`,
);

for (const size of [16, 32, 48, 128]) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) pixels.set(samplePixel(x, y, size), y * stride + 1 + x * 4);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icons/raytab-sun-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
