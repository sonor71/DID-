import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.__FRAKTUM_CONFIG__={VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_test'};
const id='01234567-89ab-4cde-8f01-23456789abcd';
test('permalink fetch is independent of the feed window and requests a public UUID only',async()=>{
  const requests=[];
  globalThis.fetch=async input=>{
    const url=new URL(input);requests.push(url);
    const table=url.pathname.split('/').pop();
    let rows=[];
    if(table==='lit_posts')rows=[{id,author_id:'author',body:'An older post',created_at:'2025-01-01'}];
    if(table==='lit_profiles')rows=[{id:'author',username:'writer',nickname:'Author'}];
    return Response.json(rows);
  };
  const {fetchPublicPost}=await import(`../../src/cloud.js?post=${Date.now()}`);
  const post=await fetchPublicPost(id);
  assert.equal(post.text,'An older post');assert.equal(post.cloudId,id);
  assert.equal(requests[0].searchParams.get('id'),`eq.${id}`);
  assert.equal(requests[0].searchParams.get('visibility'),'eq.public');
  assert.equal(requests[0].searchParams.get('limit'),'1');
  assert.equal(requests.some(url=>url.searchParams.get('limit')==='50'),false);
});
test('deleted post returns null while access denial remains an explicit failure',async()=>{
  const {fetchPublicPost}=await import(`../../src/cloud.js?missing=${Date.now()}`);
  globalThis.fetch=async()=>Response.json([]);
  assert.equal(await fetchPublicPost(id),null);
  globalThis.fetch=async()=>Response.json({message:'permission denied'},{status:403});
  await assert.rejects(fetchPublicPost(id),/403.*permission denied/);
  await assert.rejects(fetchPublicPost('invalid'),/Некорректная ссылка/);
});
