import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__FRAKTUM_CONFIG__={VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_editor_fixture'};
const session={user:{id:'11111111-1111-4111-8111-111111111111'},access_token:'fixture-access',expires_at:Math.floor(Date.now()/1000)+3600};
globalThis.localStorage={getItem:key=>key==='d20-supabase-session-v1'?JSON.stringify(session):null,setItem(){},removeItem(){}};
const {uploadWorkAsset,saveCloudFragment,fetchCloudLiterature,saveCloudWork}=await import('../../src/cloud.js');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('editor upload registers a persistent owner asset record after storage upload',async()=>{
  const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),...options});return String(url).includes('/rest/v1/lit_editor_assets')?json([{id:'asset-id'}]):json({});};
  const result=await uploadWorkAsset('work-id/image.png',new File(['image bytes'],'image.png',{type:'image/png'}));
  assert.equal(calls.length,3);assert.equal(calls[1].method,'HEAD');assert.equal(calls[0].method,'POST');assert.match(calls[0].url,/storage\/v1\/object\/lit-work-assets\//);
  const record=JSON.parse(calls[2].body);assert.equal(record.owner_id,session.user.id);assert.equal(record.storage_path,`${session.user.id}/work-id/image.png`);assert.equal(record.byte_size,11);
  assert.equal(result.assetId,'asset-id');assert.match(result.url,/\/storage\/v1\/object\/public\/lit-work-assets\//);
});
test('metadata failure removes only the just-uploaded orphan and reports failure',async()=>{
  const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),...options});return String(url).includes('/rest/v1/lit_editor_assets')?json({message:'asset record denied'},403):json({});};
  await assert.rejects(uploadWorkAsset('work-id/failed.png',new File(['bytes'],'failed.png',{type:'image/png'})),/asset record denied/);
  const cleanup=calls.find(call=>call.method==='DELETE');assert.ok(cleanup);assert.deepEqual(JSON.parse(cleanup.body).prefixes,[`${session.user.id}/work-id/failed.png`]);
});
test('fragment cloud save and later reload preserve structured images and layout',async()=>{
  const image={id:'image1',type:'image',assetId:'asset1',storagePath:'user/work/image.png',assetPath:'user/work/image.png',src:'https://assets.test/image.png',url:'https://assets.test/image.png',pageId:'page1',x:100,y:140,width:260,height:200,zIndex:2,layoutMode:'free',wrapMode:'right',alt:'Image',caption:'Caption'};
  const local={title:'Fragment',content:'Text',documentPages:[{id:'page1',canvas:{objects:[image]}}],mediaLibrary:[{assetId:'asset1',storagePath:image.storagePath,url:image.url}]};
  let saved;
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){saved={id:'fragment1',...JSON.parse(options.body)};return json([saved]);}
    if(String(url).includes('/lit_fragments?'))return json([saved]);
    return json([]);
  };
  await saveCloudFragment(local,{publish:false});
  assert.equal(saved.visibility,'private');assert.deepEqual(saved.content.documentPages,local.documentPages);
  const reloaded=await fetchCloudLiterature();assert.equal(reloaded.works.length,1);
  assert.equal(reloaded.works[0].fragmentCloudId,'fragment1');assert.deepEqual(reloaded.works[0].documentPages[0].canvas.objects[0],image);
});
test('cloud persistence rejects transient references before any remote write',async()=>{
  let requests=0;globalThis.fetch=async()=>{requests++;return json([]);};
  const local={documentPages:[{canvas:{objects:[{type:'image',src:'blob:temporary'}]}}]};
  await assert.rejects(saveCloudWork(local),/ещё не загружено/);
  await assert.rejects(saveCloudFragment(local),/ещё не загружено/);assert.equal(requests,0);
});
