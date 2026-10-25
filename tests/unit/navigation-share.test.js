import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudPostId,postPermalink,sharePost} from '../../src/feed/PostLinks.js';
import {parseRoute,routePath,createNavigationTransition} from '../../src/navigation/Navigation.js';
import {withBusy} from '../../src/navigation/AsyncFeedback.js';

const id='01234567-89ab-4cde-8f01-23456789abcd';
const post={cloud:true,cloudId:id,text:'Do not leak private draft text'};
test('post links accept only stable cloud UUIDs and survive direct route parsing',()=>{
  assert.equal(cloudPostId(`cloud:${id.toUpperCase()}`),id);
  assert.equal(postPermalink(post,'https://literature.example'),`https://literature.example/post/${id}`);
  assert.deepEqual(parseRoute(`https://literature.example/post/${id}`),{page:'post',postId:id});
  assert.throws(()=>cloudPostId('id&visibility=eq.private'));
  assert.throws(()=>parseRoute('/post/not-a-post'));
  assert.throws(()=>postPermalink({id,cloud:false},'https://literature.example'));
  const route={page:'reader',work:'cloud:book'};
  assert.deepEqual(parseRoute(routePath(route)),route);
});
test('native share and clipboard fallback deliver the same permalink',async()=>{
  let payload,clipboard;
  assert.equal(await sharePost(post,{origin:'https://literature.example',navigator:{share:async data=>{payload=data;}}}),'shared');
  assert.deepEqual(payload,{title:'Пост во FRAKTUM',url:`https://literature.example/post/${id}`});
  assert.equal(await sharePost(post,{origin:'https://literature.example',navigator:{clipboard:{writeText:async text=>{clipboard=text;}}}}),'copied');
  assert.equal(clipboard,payload.url);
});
test('share cancellation is distinct from permission and clipboard errors',async()=>{
  const cancelled=new Error('cancelled');cancelled.name='AbortError';
  assert.equal(await sharePost(post,{origin:'https://literature.example',navigator:{share:async()=>{throw cancelled;}}}),'cancelled');
  await assert.rejects(sharePost(post,{origin:'https://literature.example',navigator:{share:async()=>{throw new Error('permission denied');}}}),/permission denied/);
  await assert.rejects(sharePost(post,{origin:'https://literature.example',navigator:{clipboard:{writeText:async()=>{throw new Error('clipboard denied');}}}}),/clipboard denied/);
});
test('busy feedback prevents duplicate writes and restores a failed control',async()=>{
  const attributes=new Map();
  const control={disabled:false,setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key),removeAttribute:key=>attributes.delete(key)};
  let release,calls=0;
  const pending=withBusy(control,()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  assert.equal(control.disabled,true);
  await withBusy(control,()=>{calls++;});
  assert.equal(calls,1);
  release();await pending;
  assert.equal(control.disabled,false);
  await assert.rejects(withBusy(control,async()=>{throw new Error('save failed');}),/save failed/);
  assert.equal(control.disabled,false);assert.equal(attributes.has('aria-busy'),false);
});
test('navigation CSS fallback respects reduced motion and adds one page animation',()=>{
  let rendered=0,animations=0;
  const page={classList:{add:()=>animations++,remove(){}},addEventListener(){}};
  for(const reduced of [false,true]){
    const transition=createNavigationTransition({document:{querySelector:()=>page},window:{matchMedia:()=>({matches:reduced})},onError:error=>{throw error;}});
    transition(()=>rendered++);
  }
  assert.equal(rendered,2);assert.equal(animations,1);
});
test('rapid native navigation cannot commit an obsolete page',()=>{
  const callbacks=[],commits=[];
  const document={startViewTransition:callback=>{callbacks.push(callback);return {ready:Promise.resolve(),updateCallbackDone:Promise.resolve(),finished:Promise.resolve(),skipTransition(){}};}};
  const transition=createNavigationTransition({document,window:{matchMedia:()=>({matches:false})},onError:error=>{throw error;}});
  transition(()=>commits.push('obsolete'));transition(()=>commits.push('current'));
  callbacks[0]();callbacks[1]();
  assert.deepEqual(commits,['current']);
});
