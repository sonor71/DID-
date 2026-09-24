import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const parts = [
  'chunk_00',
  'fix_01_0', 'fix_01_1', 'fix_01_2', 'fix_01_3',
  'chunk_02',
  'chunk_03', 'fix_03_tail_0', 'fix_03_tail_1',
  'chunk_04', 'chunk_05', 'chunk_06'
];

let encoded = '';
for (const part of parts) {
  encoded += (await readFile(new URL(`./payload/${part}`, import.meta.url), 'utf8')).trim();
}

if (encoded.length !== 115240) {
  throw new Error(`FRAKTUM bundle is incomplete: ${encoded.length}/115240 base64 bytes`);
}

const archive = Buffer.from(encoded, 'base64');
const digest = createHash('sha256').update(archive).digest('hex');
if (archive.length !== 86430 || digest !== '9f99bab6f10593d3ad65244d531cf14907836ad18c7858f523073717885fb038') {
  throw new Error(`FRAKTUM bundle checksum mismatch: ${archive.length} bytes, ${digest}`);
}

const unpack = new URL('./.bundle/', import.meta.url);
const out = new URL('./dist/', import.meta.url);
await rm(unpack, { recursive: true, force: true });
await rm(out, { recursive: true, force: true });
await mkdir(unpack, { recursive: true });

new AdmZip(archive).extractAllTo(fileURLToPath(unpack), true);
const bundledDist = new URL('./.bundle/fraktum-messenger-v0.2.3/dist/', import.meta.url);
await cp(bundledDist, out, { recursive: true });

console.log(`Built FRAKTUM Messenger v0.2.3 -> dist/ (${archive.length} bytes verified)`);
