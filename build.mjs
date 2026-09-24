import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const parts = ['v030_00', 'v030_01', 'v030_02', 'v030_03'];
let encoded = '';
for (const part of parts) {
  encoded += (await readFile(new URL(`./payload/${part}`, import.meta.url), 'utf8')).trim();
}

if (encoded.length !== 58044) {
  throw new Error(`FRAKTUM v0.3 bundle incomplete: ${encoded.length}/58044`);
}

const archive = Buffer.from(encoded, 'base64');
const digest = createHash('sha256').update(archive).digest('hex');
if (archive.length !== 43531 || digest !== 'cdb5e22a5982b3efd5190c2bc141f6c5d72ffa084f69d2b0e072d276953404b6') {
  throw new Error(`FRAKTUM v0.3 checksum mismatch: ${archive.length} bytes, ${digest}`);
}

const unpack = new URL('./.bundle/', import.meta.url);
const out = new URL('./dist/', import.meta.url);
await rm(unpack, { recursive: true, force: true });
await rm(out, { recursive: true, force: true });
await mkdir(unpack, { recursive: true });
new AdmZip(archive).extractAllTo(fileURLToPath(unpack), true);
const bundledDist = new URL('./.bundle/fraktum-messenger-v0.3.0/dist/', import.meta.url);
await cp(bundledDist, out, { recursive: true });
console.log('Built FRAKTUM Messenger v0.3.0 -> dist/');
