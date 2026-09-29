import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host}`);
  let rel=decodeURIComponent(url.pathname);
  if(rel==='/') rel='/index.html';
  const publicCandidate=path.join(root,'public',rel);
  const rootCandidate=path.join(root,rel);
  let file=fs.existsSync(publicCandidate)&&fs.statSync(publicCandidate).isFile()?publicCandidate:rootCandidate;
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()) file=path.join(root,'index.html');
  const ext=path.extname(file).toLowerCase();
  res.setHeader('Content-Type',types[ext]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port,()=>console.log(`D20 is running on http://localhost:${port}`));
