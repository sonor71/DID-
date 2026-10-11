import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntimeConfig,loadEnvironment,serializeRuntimeConfig} from './scripts/runtime-config.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(root,'dist');
// Validate before touching dist so a missing Vercel variable cannot replace a
// healthy deployment artifact with an unusable build.
const runtimeConfig=createRuntimeConfig(loadEnvironment(root));

fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});

// App shell and source modules keep their paths.
fs.cpSync(path.join(root,'index.html'),path.join(dist,'index.html'));
fs.cpSync(path.join(root,'src'),path.join(dist,'src'),{recursive:true});
fs.writeFileSync(path.join(dist,'runtime-config.js'),serializeRuntimeConfig(runtimeConfig));

// Files inside /public are served from the site root both locally and on Vercel.
const publicDir=path.join(root,'public');
if(fs.existsSync(publicDir)){
  for(const entry of fs.readdirSync(publicDir)){
    fs.cpSync(path.join(publicDir,entry),path.join(dist,entry),{recursive:true});
  }
}

console.log('Built static app to ./dist');
