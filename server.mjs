import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntimeConfig,loadEnvironment,serializeRuntimeConfig} from './scripts/runtime-config.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const environment=loadEnvironment(root);
const runtimeConfig=createRuntimeConfig(environment);
const port=Number(environment.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  let url,rel;
  try{
    url=new URL(req.url||'/','http://localhost');
    rel=decodeURIComponent(url.pathname);
    if(rel.includes('\0'))throw new URIError('Null path');
  }catch{res.writeHead(400);res.end('Bad request');return;}
  if(rel.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
  if(url.pathname==='/runtime-config.js'){
    res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(serializeRuntimeConfig(runtimeConfig));return;
  }
  if(rel==='/') rel='/index.html';
  const publicCandidate=path.join(root,'public',rel);
  const rootCandidate=path.join(root,rel);
  let file=fs.existsSync(publicCandidate)&&fs.statSync(publicCandidate).isFile()?publicCandidate:(rel==='/index.html'||rel.startsWith('/src/'))?rootCandidate:null;
  if(!file||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    if(path.extname(rel)){res.writeHead(404);res.end('Not found');return;}
    file=path.join(root,'index.html');
  }
  const ext=path.extname(file).toLowerCase();
  res.setHeader('Content-Type',types[ext]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port,()=>console.log(`D20 is running on http://localhost:${port}`));
