import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryManager} from '../../src/editor/HistoryManager.js';
import {assertPersistableDocument} from '../../src/editor/Serialization.js';
import {AssetService,AssetValidationError,validateImageFile} from '../../src/editor/AssetService.js';

test('history treats a gesture as one undoable transaction',()=>{
  let current={x:0};const history=new HistoryManager({apply:value=>{current=value;}});
  history.begin(current,'move');current={x:10};history.commit(current);
  assert.equal(history.canUndo,true);history.undo();assert.deepEqual(current,{x:0});history.redo();assert.deepEqual(current,{x:10});
});

test('serialization rejects embedded data URLs',()=>{
  assert.throws(()=>assertPersistableDocument({pages:[{objects:[{src:'data:image/png;base64,AA=='}]}]}),/embedded binary/);
  assert.doesNotThrow(()=>assertPersistableDocument({storagePath:'user/work/image.webp'}));
});

test('asset service validates and persists only storage metadata',async()=>{
  const calls=[];const service=new AssetService({upload:async(path,file)=>calls.push([path,file]),resolveUrl:path=>`https://assets.test/${path}`});
  const file={name:'cover photo.png',type:'image/png',size:42};const result=await service.uploadImage(file,{workId:'work-1'});
  assert.equal(calls.length,1);assert.match(result.storagePath,/^work-1\/[\w-]+-cover-photo\.png$/);assert.equal('data' in result,false);
});

test('asset validation blocks SVG and oversized files',()=>{
  assert.throws(()=>validateImageFile({name:'x.svg',type:'image/svg+xml',size:10}),AssetValidationError);
  assert.throws(()=>validateImageFile({name:'x.png',type:'image/png',size:13_000_000}),AssetValidationError);
});
