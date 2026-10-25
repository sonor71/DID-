import test from 'node:test';
import assert from 'node:assert/strict';

const owner='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222';
const session={access_token:'test-access-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:owner}};
globalThis.__FRAKTUM_CONFIG__={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
globalThis.localStorage={getItem:key=>key==='d20-supabase-session-v1'?JSON.stringify(session):null,setItem(){},removeItem(){}};
const requests=[];let allowAccept=true;
globalThis.fetch=async(url,options={})=>{
 const request={url:new URL(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null};requests.push(request);
 const table=request.url.pathname.split('/').at(-1);let payload=[];
 if(table==='lit_conversation_members')payload=[{user_id:owner},{user_id:peer}];
 if(table==='lit_profiles')payload=[{id:peer,nickname:'Peer'}];
 if(table==='lit_calls'&&request.method==='POST')payload=[{id:'call-fixture',mode:request.body.mode,status:'ringing'}];
 if(table==='lit_calls'&&request.method==='PATCH')payload=allowAccept?[{id:'call-fixture',...request.body}]:[];
 return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};
const cloud=await import('../../src/cloud.js');

test('cloud call contract uses authenticated participant, recipient-bound ordered signals and conditional acceptance',async()=>{
 assert.equal((await cloud.getConversationPeer('conversation-fixture')).id,peer);
 const call=await cloud.createCloudCall('conversation-fixture','video');assert.equal(call.mode,'video');
 const created=requests.find(request=>request.method==='POST'&&request.url.pathname.endsWith('/lit_calls'));assert.equal(created.body.started_by,owner);assert.equal(created.body.status,'ringing');
 await cloud.sendCloudCallSignal(call.id,peer,'ice',{candidate:'test-candidate'});
 const signal=requests.find(request=>request.method==='POST'&&request.url.pathname.endsWith('/lit_call_signals'));assert.equal(signal.body.sender_id,owner);assert.equal(signal.body.recipient_id,peer);assert.equal(signal.body.call_id,call.id);
 await cloud.fetchCloudCallSignals(call.id,8);const read=requests.at(-1).url.searchParams;assert.equal(read.get('recipient_id'),`eq.${owner}`);assert.equal(read.get('id'),'gt.8');assert.equal(read.get('order'),'id.asc');
 await cloud.setCloudCallStatus(call.id,'active',{expectedStatus:'ringing'});const patch=requests.at(-1);assert.equal(patch.url.searchParams.get('status'),'eq.ringing');assert.ok(patch.body.answered_at);
 allowAccept=false;await assert.rejects(cloud.setCloudCallStatus(call.id,'active',{expectedStatus:'ringing'}),/уже завершён или принят/);
 await assert.rejects(cloud.setCloudCallStatus(call.id,'invented'),/Недопустимый статус/);
});
