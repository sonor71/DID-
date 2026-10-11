import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(root,'dist');

fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});

// App shell and source modules keep their paths.
fs.cpSync(path.join(root,'index.html'),path.join(dist,'index.html'));
fs.cpSync(path.join(root,'src'),path.join(dist,'src'),{recursive:true});
const runtimeKeys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_PUSH_PUBLIC_KEY','VITE_ENABLE_DEMO_DATA'];
const runtimeConfig=Object.fromEntries(runtimeKeys.map(key=>[key,process.env[key]||'']));
fs.writeFileSync(path.join(dist,'runtime-config.js'),`globalThis.__FRAKTUM_CONFIG__=${JSON.stringify(runtimeConfig)};\n`);

// Files inside /public are served from the site root both locally and on Vercel.
const publicDir=path.join(root,'public');
if(fs.existsSync(publicDir)){
  for(const entry of fs.readdirSync(publicDir)){
    fs.cpSync(path.join(publicDir,entry),path.join(dist,entry),{recursive:true});
  }
}

console.log('Built static app to ./dist');
