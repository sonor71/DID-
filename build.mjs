import { cp, mkdir, rm } from 'node:fs/promises';
const out = new URL('./dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('./index.html', import.meta.url), new URL('./dist/index.html', import.meta.url));
await cp(new URL('./src/', import.meta.url), new URL('./dist/src/', import.meta.url), { recursive: true });
await cp(new URL('./public/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true });
console.log('Built FRAKTUM Messenger v0.2.3 -> dist/');
