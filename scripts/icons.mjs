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
mkdirSync('public/icons', { recursive: true });
for (const n of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5,
        dy = (y + 0.5) / n - 0.5,
        r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx),
        ray = Math.abs(Math.sin(angle * 4)) < 0.16 && r > 0.23 && r < 0.37;
      const lit = r < 0.17 || ray,
        i = y * (n * 4 + 1) + 1 + x * 4;
      pixels.set(lit ? [239, 205, 144, 255] : [24, 48, 59, 255], i);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(n);
  header.writeUInt32BE(n, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icons/icon${n}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
