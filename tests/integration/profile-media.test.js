import test from 'node:test';
import assert from 'node:assert/strict';

const userId='11111111-1111-4111-8111-111111111111';
let sequence=0;
async function cloud(){
  const values=new Map([['d20-supabase-session-v1',JSON.stringify({access_token:'fixture-session',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId}})]]);
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  globalThis.__FRAKTUM_CONFIG__={VITE_SUPABASE_URL:'https://profile-fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_profile_fixture'};
  return import(`../../src/cloud.js?profile-test=${sequence++}`);
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const image=()=>new File([new Uint8Array([1,2,3])],'prepared.webp',{type:'image/webp'});

test('profile image replacement commits immutable path before deleting previous object',async()=>{
  const api=await cloud(),calls=[];let profile={id:userId,avatar_path:`${userId}/avatar.webp`};
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),...options});
    if(options.method==='PATCH'){profile={...profile,...JSON.parse(options.body)};return json([profile]);}
    if(!options.method||options.method==='GET')return json([profile]);
    return json({});
  };
  const first=await api.uploadProfileMedia('avatar',image());
  const second=await api.uploadProfileMedia('avatar',image());
  assert.notEqual(first.path,second.path);assert.match(first.path,new RegExp(`^${userId}/avatar-[a-f0-9-]+\\.webp$`));
  assert.equal(profile.avatar_path,second.path);assert.equal(first.warning,'');
  assert.deepEqual(calls.slice(0,4).map(call=>call.method||'GET'),['GET','POST','PATCH','DELETE']);
  assert.equal(calls[1].headers['x-upsert'],'false');
  assert.deepEqual(JSON.parse(calls[3].body),{prefixes:[`${userId}/avatar.webp`]});
  const reloaded=await api.getMyProfile();assert.equal(reloaded.avatar_path,second.path);
});

test('failed profile patch rolls back new upload and keeps previous image untouched',async()=>{
  const api=await cloud(),deleted=[];const old=`${userId}/banner.webp`;let uploaded='';
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){uploaded=String(url).split('/lit-profile-banners/')[1];return json({});}
    if(options.method==='PATCH')return json({message:'permission denied for table lit_profiles'},403);
    if(options.method==='DELETE'){deleted.push(...JSON.parse(options.body).prefixes);return json({});}
    return json([{id:userId,banner_path:old}]);
  };
  await assert.rejects(api.uploadProfileMedia('banner',image()),/permission denied/);
  assert.deepEqual(deleted,[uploaded]);assert.notEqual(deleted[0],old);
});

test('empty PATCH response is an error and does not leave a successful upload claim',async()=>{
  const api=await cloud(),methods=[];
  globalThis.fetch=async(url,options={})=>{
    methods.push(options.method||'GET');
    if(!options.method||options.method==='GET')return json([{id:userId,avatar_path:null}]);
    return options.method==='PATCH'?json([]):json({});
  };
  await assert.rejects(api.uploadProfileMedia('avatar',image()),/UPDATE/);
  assert.deepEqual(methods,['GET','POST','PATCH','DELETE']);
});

test('remove profile image persists null before cleanup; cleanup failure is reported truthfully',async()=>{
  const api=await cloud(),methods=[];let profile={id:userId,banner_path:`${userId}/old.webp`};
  globalThis.fetch=async(url,options={})=>{
    methods.push(options.method||'GET');
    if(options.method==='PATCH'){profile={...profile,...JSON.parse(options.body)};return json([profile]);}
    if(options.method==='DELETE')return json({message:'storage unavailable'},503);
    return json([profile]);
  };
  const result=await api.removeProfileMedia('banner');
  assert.equal(profile.banner_path,null);assert.equal(result.url,'');assert.match(result.warning,/storage unavailable/);
  assert.deepEqual(methods,['GET','PATCH','DELETE']);
  assert.equal((await api.getMyProfile()).banner_path,null);
});

test('profile and normalized details use one transactional RPC request',async()=>{
  const api=await cloud(),calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return json({id:userId,nickname:'Saved'});};
  const result=await api.saveMyProfile({profile:{nickname:'Saved',username:'writer'},favoriteBooks:[{title:'Book'}],preferences:{wantedGenres:[1],unwantedGenres:[],wantedTopics:[],unwantedTopics:[3]}});
  assert.equal(result.nickname,'Saved');assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/rpc\/lit_update_my_profile$/);
  const body=JSON.parse(calls[0].options.body);assert.deepEqual(body.p_wanted_genres,[1]);assert.deepEqual(body.p_books,[{title:'Book'}]);
});

test('invalid profile image kind and file are rejected before network writes',async()=>{
  const api=await cloud();globalThis.fetch=()=>assert.fail('invalid file must never reach the network');
  await assert.rejects(api.uploadProfileMedia('other',image()),/Неизвестный/);
  await assert.rejects(api.uploadProfileMedia('avatar',new File(['svg'],'bad.svg',{type:'image/svg+xml'})),/JPEG/);
});
