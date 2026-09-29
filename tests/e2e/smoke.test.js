import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
let server;
test.before(async()=>{server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'5199'},stdio:'ignore'});for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:5199/')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('application did not start');});
test.after(()=>server?.kill());
test('application serves onboarding shell and editor modules',async()=>{
 const html=await (await fetch('http://127.0.0.1:5199/')).text();assert.match(html,/id="app"/);assert.match(html,/src="\/src\/app\.js"/);
 for(const path of ['/src/app.js','/src/pages.js','/src/editor/EditorRoot.js','/src/editor/HistoryManager.js','/src/editor/AssetService.js'])assert.equal((await fetch(`http://127.0.0.1:5199${path}`)).status,200);
});
test('major navigation and editor actions are registered without missing functions',async()=>{
 const app=await (await fetch('http://127.0.0.1:5199/src/app.js')).text();const pages=await (await fetch('http://127.0.0.1:5199/src/pages.js')).text();
 for(const page of ['home','read','evaluate','library','create','communities','messages','profile','admin','reader'])assert.match(app,new RegExp(`${page}:pages\\.`));
 for(const action of ['canvas-add-text','insert-canvas-media','canvas-delete','preview-work','open-community'])assert.match(app,new RegExp(`action==='${action}'`));
 assert.doesNotMatch(pages,/onclick\s*=/);
});
