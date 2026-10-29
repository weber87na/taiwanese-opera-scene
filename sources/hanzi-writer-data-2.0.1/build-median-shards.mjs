import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Data-only conversion: never imports or executes anything from the archive.
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(sourceDir, '../..');
const destination = path.join(projectDir, 'dist/assets/ink-strokes');
const metadata = JSON.parse(fs.readFileSync(path.join(sourceDir, 'npm-metadata.json'), 'utf8'));
if (metadata.name !== 'hanzi-writer-data' || metadata.version !== '2.0.1') {
  throw new Error('Expected the pinned hanzi-writer-data@2.0.1 package');
}
const archiveName = 'hanzi-writer-data-2.0.1.tgz';
const archive = fs.readFileSync(path.join(sourceDir, archiveName));
const sha1 = crypto.createHash('sha1').update(archive).digest('hex');
const integrity = `sha512-${crypto.createHash('sha512').update(archive).digest('base64')}`;
if (sha1 !== metadata.dist.shasum || integrity !== metadata.dist.integrity) {
  throw new Error('Official npm archive integrity check failed');
}

const tar = zlib.gunzipSync(archive);
const characters = new Map();
const retained = new Map();
let strokeCount = 0, pointCount = 0;
const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.toString('utf8', 0, 100).replace(/\0.*$/s, '');
  if (!name) break;
  const size = parseInt(header.toString('ascii', 124, 136), 8) || 0;
  const type = header.toString('ascii', 156, 157);
  if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) {
    throw new Error('Invalid archive entry size');
  }
  const checksum = parseInt(header.toString('ascii', 148, 156), 8);
  let actualChecksum = 0;
  for (let i = 0; i < 512; i++) actualChecksum += i >= 148 && i < 156 ? 32 : header[i];
  if (checksum !== actualChecksum) throw new Error(`Tar header checksum mismatch: ${name}`);
  const bytes = tar.subarray(offset + 512, offset + 512 + size);
  offset += 512 + Math.ceil(size / 512) * 512;
  if (type !== '0' && type !== '\0') continue;
  // Only exact filenames are retained; no archive path is extracted to disk.
  if (name === 'package/ARPHICPL.TXT' || name === 'package/README.md') retained.set(name, bytes);
  const match = /^package\/([^/]+)\.json$/u.exec(name);
  if (!match || Array.from(match[1]).length !== 1) continue;
  const character = match[1];
  if (characters.has(character)) throw new Error(`Duplicate character: ${character}`);
  const data = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(data.medians) || data.medians.length === 0) throw new Error(`No medians: ${character}`);
  for (const median of data.medians) {
    if (!Array.isArray(median) || median.length < 2) throw new Error(`Invalid median: ${character}`);
    for (const point of median) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
        throw new Error(`Invalid point: ${character}`);
      }
      bounds.minX = Math.min(bounds.minX, point[0]); bounds.maxX = Math.max(bounds.maxX, point[0]);
      bounds.minY = Math.min(bounds.minY, point[1]); bounds.maxY = Math.max(bounds.maxY, point[1]);
      pointCount++;
    }
    strokeCount++;
  }
  characters.set(character, { medians: data.medians });
}
if (!retained.has('package/ARPHICPL.TXT')) throw new Error('The original license is missing');

const modifiedOn = '2026-10-29';
const notice = `Modified ${modifiedOn}: retained original stroke-order medians and coordinates only; removed outlines and other fields; regrouped hanzi-writer-data@2.0.1 into Unicode high-byte shards and a default-text subset. Copyright (C) 1999 Arphic Technology Co., Ltd. These derived data remain under the ARPHIC PUBLIC LICENSE; see ARPHICPL.TXT and SOURCE.md.`;
const shardName = character => `u${Math.floor(character.codePointAt(0) / 256).toString(16).padStart(2, '0')}`;
const groups = new Map();
for (const [character, data] of [...characters].sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0))) {
  const key = shardName(character);
  if (!groups.has(key)) groups.set(key, { _notice: notice });
  groups.get(key)[character] = data;
}
fs.mkdirSync(destination, { recursive: true });
const index = {
  format: 'hanzi-writer-medians-v1',
  source: { package: metadata.name, version: metadata.version, repository: 'https://github.com/chanind/hanzi-writer-data', tarball: metadata.dist.tarball, sha1, integrity },
  modifiedOn, license: 'ARPHICPL.TXT', noticeKey: '_notice',
  characterCount: characters.size, strokeCount, pointCount, bounds,
  shardShift: 8, shardPattern: 'u{floor(codePoint / 256).toString(16).padStart(2, "0")}.json',
  coordinateSystem: { unitsPerEm: 1024, yAxis: 'up', nominalBottom: -124, nominalTop: 900 },
  shards: {},
};
let shardBytes = 0;
for (const [key, data] of groups) {
  const serialized = `${JSON.stringify(data)}\n`;
  const bytes = Buffer.byteLength(serialized);
  fs.writeFileSync(path.join(destination, `${key}.json`), serialized);
  index.shards[key] = { file: `${key}.json`, characters: Object.keys(data).length - 1, bytes };
  shardBytes += bytes;
}

const config = fs.readFileSync(path.join(projectDir, 'dist/intro-config.json'), 'utf8');
const defaultCharacters = [...new Set(Array.from(config).filter(character => /\p{Script=Han}/u.test(character)))];
const defaults = { _notice: notice };
const missingDefaults = [];
for (const character of defaultCharacters) {
  if (characters.has(character)) defaults[character] = characters.get(character);
  else missingDefaults.push(character);
}
const serializedDefaults = `${JSON.stringify(defaults)}\n`;
fs.writeFileSync(path.join(destination, 'defaults.json'), serializedDefaults);
index.defaults = { file: 'defaults.json', characters: Object.keys(defaults).length - 1, bytes: Buffer.byteLength(serializedDefaults), missing: missingDefaults, basedOn: 'dist/intro-config.json' };
index.totalShardBytes = shardBytes;
fs.writeFileSync(path.join(destination, 'ARPHICPL.TXT'), retained.get('package/ARPHICPL.TXT'));
fs.writeFileSync(path.join(sourceDir, 'UPSTREAM-README.md'), retained.get('package/README.md'));
fs.writeFileSync(path.join(destination, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(destination, 'SOURCE.md'), `# Local Hanzi stroke-order medians\n\nOfficial source: [chanind/hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), pinned npm package [hanzi-writer-data@2.0.1](https://registry.npmjs.org/hanzi-writer-data/2.0.1). The upstream data derive from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and Arphic fonts.\n\n${notice}\n\nThe original license is preserved byte-for-byte in ARPHICPL.TXT. No warranty is provided. These data and the conversion are available under the same ARPHIC PUBLIC LICENSE. The application code is separate from these data.\n\n## Conversion\n\nThe archive was verified against both npm SHA-1 and SHA-512 integrity values. Only character JSON files were parsed. No downloaded package code was installed or executed. The unmodified medians retain the source stroke order and numeric coordinates; SVG outline paths and all other per-character fields were omitted. All ${characters.size} characters from the published archive are included in ${groups.size} shards, with ${strokeCount} strokes and ${pointCount} median points.\n\nEach shard is a direct map of character to {medians: [[[x,y], ...], ...]}; its _notice entry is metadata, not a character. The shard for a character is computed as 'u' + Math.floor(character.codePointAt(0) / 256).toString(16).padStart(2, '0') + '.json'. For example, 一 is in u4e.json. No network dependency is needed at runtime.\n\nLoad defaults.json first for the current ${index.defaults.characters} configured characters, then request only missing characters' shards when content changes. defaults.json is only a cache, not a coverage limit. Characters absent from the upstream package should use the application's fallback. index.json lists exact coverage counts, sizes, and coordinate bounds. Coordinates are y-up in a nominal 1024-unit em, from y=-124 to y=900; for a top-down canvas use canvasY = (900 - y) * scale.\n\nThe preserved archive, npm metadata, upstream README, and reproducible data-only converter are in sources/hanzi-writer-data-2.0.1/. To rebuild from the preserved archive, run node sources/hanzi-writer-data-2.0.1/build-median-shards.mjs from the project folder. No package installation is needed.\n\nSHA-1: ${sha1}\n\nSHA-512 integrity: ${integrity}\n`);
console.log(JSON.stringify({ characters: characters.size, shards: groups.size, strokeCount, pointCount, shardBytes, defaults: index.defaults, bounds, integrityVerified: true }, null, 2));
