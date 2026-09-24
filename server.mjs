import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||5174);
const SUPABASE_AUTH='https://bvnbqjhgnlvthkluddfj.supabase.co/auth/v1';
const SUPABASE_STORAGE='https://bvnbqjhgnlvthkluddfj.supabase.co/storage/v1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.webm':'video/webm'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/auth-proxy/')){
      const suffix=url.pathname.slice('/auth-proxy'.length)+url.search;
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?Buffer.concat(chunks):undefined;
      const headers={};
      for(const [k,v] of Object.entries(req.headers)){
        if(!v||['host','content-length','connection','accept-encoding'].includes(k.toLowerCase()))continue;
        headers[k]=Array.isArray(v)?v.join(', '):v;
      }
      const upstream=await fetch(SUPABASE_AUTH+suffix,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:body,redirect:'manual'});
      const outHeaders={'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'};
      for(const k of ['retry-after','x-sb-error-code']){const v=upstream.headers.get(k);if(v)outHeaders[k]=v}
      const data=Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status,outHeaders);res.end(data);return;
    }
    if(url.pathname.startsWith('/storage-proxy/')){
      const suffix=url.pathname.slice('/storage-proxy'.length)+url.search;
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?Buffer.concat(chunks):undefined;
      const headers={};
      for(const [k,v] of Object.entries(req.headers)){
        if(!v||['host','content-length','connection','accept-encoding'].includes(k.toLowerCase()))continue;
        headers[k]=Array.isArray(v)?v.join(', '):v;
      }
      const upstream=await fetch(SUPABASE_STORAGE+suffix,{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:body,redirect:'manual'});
      const outHeaders={'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'};
      for(const k of ['location','etag','x-upsert','x-sb-error-code']){const v=upstream.headers.get(k);if(v)outHeaders[k]=v}
      const data=Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status,outHeaders);res.end(data);return;
    }
    let p=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    p=normalize(p).replace(/^([.][.][\\/])+/, '');
    let file=join(root,p);
    try{const s=await stat(file);if(s.isDirectory())file=join(file,'index.html');}catch{file=join(root,'index.html');}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(err){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end(String(err));}
});
server.listen(port,()=>console.log(`FRAKTUM Messenger: http://localhost:${port}`));
