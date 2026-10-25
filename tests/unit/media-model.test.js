import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMediaObject,applyMediaLayout,ensureStructuredPage,assertWorkMediaReady} from '../../src/editor/MediaModel.js';
import {migrateEmbeddedWorkAssets} from '../../src/editor/LegacyMediaMigration.js';
import {assertPersistableDocument} from '../../src/editor/Serialization.js';
import {SaveQueue} from '../../src/editor/SaveQueue.js';

const url='https://assets.test/work/image.png';
test('media restoration preserves permanent asset identity and canonical geometry',()=>{
  const image=normalizeMediaObject({id:'image-1',src:url,assetId:'asset-1',storagePath:'user/work/image.png',w:280,h:220,z:4,caption:'Caption'},{pageId:'page-1'});
  const restored=normalizeMediaObject(JSON.parse(JSON.stringify(image)));
  assert.equal(restored.assetPath,'user/work/image.png');assert.equal(restored.assetId,'asset-1');assert.equal(restored.pageId,'page-1');
  assert.equal(restored.url,url);assert.equal(restored.width,280);assert.equal(restored.height,220);assert.equal(restored.zIndex,4);assert.equal(restored.caption,'Caption');
});
test('free media is clamped to the actual sheet even for malformed legacy geometry',()=>{
  const image=normalizeMediaObject({src:url,x:-200,y:5000,width:9000,height:0,zIndex:0});
  assert.equal(image.width,760);assert.equal(image.height,50);assert.equal(image.x,0);assert.equal(image.y,1030);assert.equal(image.zIndex,1);
});
test('all flow modes use bounded positions and full-width block uses the content column',()=>{
  const image=normalizeMediaObject({src:url,width:240,height:200,y:100});
  assert.equal(applyMediaLayout(image,'flow','left').x,72);
  assert.equal(applyMediaLayout(image,'flow','right').x,448);
  assert.equal(applyMediaLayout(image,'flow','center').x,260);
  const wide=applyMediaLayout(image,'flow','wide');assert.equal(wide.width,616);assert.equal(wide.x,72);
  const tall=applyMediaLayout({...image,height:1080},'flow','wide');assert.ok(tall.y+tall.height<=1080);
  assert.equal(applyMediaLayout({...image,x:33},'free','none').x,33);
});
test('new media rejects transient URLs while legacy load retains data for explicit migration',()=>{
  for(const src of ['data:image/png;base64,AA==','blob:https://test/old']){
    assert.throws(()=>normalizeMediaObject({src}),/ещё не загружено/);
    assert.equal(normalizeMediaObject({src},{allowEmbedded:true}).src,src);
  }
  assert.throws(()=>assertWorkMediaReady({documentPages:[{canvas:{objects:[{type:'image',src:'blob:expired'}]}}]}),/ещё не загружено/);
  assert.throws(()=>assertPersistableDocument({html:'<p><img src="data:image/png;base64,AA=="></p>'}),/embedded binary/);
});
test('document pages gain a text canvas without changing text or existing image metadata',()=>{
  const page=ensureStructuredPage({id:'p1',html:'<p>Original text</p>'});
  assert.equal(page.canvas.objects[0].html,'<p>Original text</p>');
  page.canvas.objects.push({id:'i1',type:'image',src:url,assetId:'a1',storagePath:'u/w/a.png',w:100,h:100});
  ensureStructuredPage(page);assert.equal(page.canvas.objects[1].assetId,'a1');assert.equal(page.canvas.objects[1].storagePath,'u/w/a.png');
});
test('legacy upload failure never partially rewrites a user draft',async()=>{
  const work={id:'legacy',documentPages:[{canvas:{objects:[{type:'image',src:'data:image/png;base64,AA=='},{type:'image',src:'data:image/png;base64,BB=='}]}}]};
  const original=structuredClone(work);let uploads=0;
  await assert.rejects(migrateEmbeddedWorkAssets(work,async()=>{if(++uploads===2)throw new Error('Storage denied');return {url,assetId:'a1',storagePath:'u/w/a.png'};},{load:async()=>({type:'image/png'})}),/Storage denied/);
  assert.deepEqual(work,original);
});
test('successful legacy migration deduplicates uploads and removes binary from every persisted reference',async()=>{
  const source='data:image/png;base64,AA==';const work={id:'legacy',cover:source,documentPages:[{html:`<figure><img src="${source}"></figure>`,canvas:{objects:[{type:'image',src:source}]}}],mediaLibrary:[{src:source}]};
  let uploads=0;
  assert.equal(await migrateEmbeddedWorkAssets(work,async()=>{uploads++;return {url,assetId:'a1',storagePath:'u/w/a.png'};},{load:async()=>({type:'image/png'})}),true);
  assert.equal(uploads,1);assert.equal(work.documentPages[0].canvas.objects[0].assetId,'a1');assert.equal(work.documentPages[0].canvas.objects[0].src,url);
  assert.doesNotThrow(()=>assertPersistableDocument(work));assert.doesNotMatch(JSON.stringify(work),/data:image/);
});
test('pending legacy media preserves original localStorage while auth remains usable in memory',async()=>{
  const original=JSON.stringify({works:[{id:'w1',content:'Legacy',documentPages:[{id:'p1',html:'<img src="data:image/png;base64,AA==">'}]}]});
  let saved=original;globalThis.localStorage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  const module=await import(`../../src/state.js?legacy-auth=${Date.now()}`);
  module.state.user={id:'authenticated-user',role:'author'};
  assert.equal(module.save(),false);assert.equal(saved,original);assert.equal(module.state.user.id,'authenticated-user');
  assert.equal(module.state.ui.localSaveStatus,'migration-required');
  await migrateEmbeddedWorkAssets(module.state.works[0],async()=>({url,assetId:'asset',storagePath:'u/w/a.png'}),{load:async()=>({type:'image/png'})});
  assert.equal(module.save(),true);assert.doesNotMatch(saved,/data:image/);
});
test('cloud saves serialize identity updates and a rejected write remains visible and retryable',async()=>{
  const queue=new SaveQueue();let cloudId=null;const events=[];
  const first=queue.run(async()=>{events.push('create');await Promise.resolve();cloudId='created-id';});
  const second=queue.run(async()=>{events.push(`update:${cloudId}`);});
  await Promise.all([first,second]);assert.deepEqual(events,['create','update:created-id']);
  await assert.rejects(queue.run(async()=>{throw new Error('Offline');}),/Offline/);
  assert.equal(await queue.run(async()=>42),42);
});
