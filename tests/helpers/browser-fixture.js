import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';

export const FIXTURE_ORIGIN='https://fixture.supabase.co';
export const FIXTURE_USER_ID='10000000-0000-4000-8000-000000000001';
export const FIXTURE_PEER_ID='10000000-0000-4000-8000-000000000002';
export const FIXTURE_POST_ID='20000000-0000-4000-8000-000000000001';
export const FIXTURE_OLD_POST_ID='20000000-0000-4000-8000-000000000002';
export const FIXTURE_THREAD_ID='30000000-0000-4000-8000-000000000001';
export const FIXTURE_GROUP_ID='30000000-0000-4000-8000-000000000002';
const PNG=fs.readFileSync(new URL('../../public/assets/icons/icon-192.png',import.meta.url));

export function fixtureSession({expiresAt=Math.floor(Date.now()/1000)+3600}={}) {
  return {access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600,expires_at:expiresAt,token_type:'bearer',user:{id:FIXTURE_USER_ID,email:'reader@example.test'}};
}

export async function startFixtureApplication() {
  const reservation=net.createServer();
  reservation.listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
  const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),VITE_SUPABASE_URL:FIXTURE_ORIGIN,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_fixture',VITE_ENABLE_DEMO_DATA:'false'},stdio:['ignore','pipe','pipe']});
  let output='';
  server.stdout.on('data',chunk=>{output+=String(chunk);});
  server.stderr.on('data',chunk=>{output+=String(chunk);});
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  try {
    for(let attempt=0;attempt<60;attempt++) {
      if(server.exitCode!==null)throw new Error(`Fixture application exited (${server.exitCode}): ${output}`);
      try {if((await fetch(base,{signal:globalThis.AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}
      await delay(50);
    }
    assert.ok(ready,`Fixture application did not start: ${output}`);
    const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome',chromium.executablePath()].find(path=>fs.existsSync(path));
    if(!executablePath)throw new Error('Chromium is required for regression tests. Install Chromium or set CHROMIUM_EXECUTABLE_PATH.');
    const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    return {base,browser,async close(){try{await browser.close();}finally{await stopServer(server);}}};
  } catch(error) {
    await stopServer(server);
    throw error;
  }
}

async function stopServer(server) {
  if(server.exitCode!==null)return;
  const exited=once(server,'exit');
  server.kill('SIGTERM');
  await Promise.race([exited,delay(2000)]);
  if(server.exitCode===null){server.kill('SIGKILL');await exited;}
}

/** A network-only test fixture. Production modules always use their real cloud client. */
export async function createFixtureContext(application,{authenticated=true,profileExists=true,width=1366,height=1000,expired=false,backend=null}={}) {
  const context=await application.browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
  if(authenticated) {
    const session=fixtureSession({expiresAt:expired?1:undefined});
    await context.addInitScript(({base,session})=>{
      if(location.origin===base&&!localStorage.getItem('fixture-session-initialized')) {
        localStorage.setItem('d20-supabase-session-v1',JSON.stringify(session));
        localStorage.setItem('fixture-session-initialized','1');
      }
    },{base:application.base,session});
  }
  const requests=[];
  const errors=[];
  const dialogs=[];
  const unknown=[];
  const tables=backend?.tables||makeTables(profileExists);
  const objects=backend?.objects||new Map();
  const failNext=new Map();
  const delayNext=new Map();
  let counter=100;
  const id=()=>`90000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`;
  await context.route(`${FIXTURE_ORIGIN}/**`,async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const method=request.method();
    let body=null;
    if(request.headers()['content-type']?.includes('application/json')) {
      try{body=request.postDataJSON();}catch{body=null;}
    }
    requests.push({method,path:url.pathname,query:url.search,body});
    const delayed=[...delayNext].find(([prefix])=>`${method} ${url.pathname}${url.search}`.startsWith(prefix));
    if(delayed){delayNext.delete(delayed[0]);await delay(delayed[1]);}
    const failure=failNext.get(`${method} ${url.pathname}`);
    if(failure){failNext.delete(`${method} ${url.pathname}`);await json(route,failure.status||500,{message:failure.message||'Fixture service error'});return;}
    if(url.pathname==='/auth/v1/otp'){await json(route,200,{});return;}
    if(url.pathname==='/auth/v1/verify') {
      await json(route,body?.token==='123456'?200:400,body?.token==='123456'?fixtureSession():{msg:'Неверный код подтверждения'});
      return;
    }
    if(url.pathname==='/auth/v1/token'){await json(route,200,fixtureSession());return;}
    if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204,body:''});return;}
    if(url.pathname.startsWith('/storage/v1/object/public/')) {
      const key=decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length));
      const object=objects.get(key);
      await route.fulfill({status:200,contentType:object?.contentType||'image/png',body:object?.body||PNG});
      return;
    }
    if(url.pathname.startsWith('/storage/v1/object/')) {
      const key=decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
      if(method==='POST'||method==='PUT')objects.set(key,{body:request.postDataBuffer(),contentType:request.headers()['content-type']});
      if(method==='DELETE')for(const prefix of body?.prefixes||[])objects.delete(`${key}/${prefix}`);
      await json(route,200,method==='DELETE'?[]:{Key:key});
      return;
    }
    if(url.pathname.startsWith('/rest/v1/rpc/')) {
      const name=url.pathname.slice('/rest/v1/rpc/'.length);
      if(name==='lit_get_or_create_direct_conversation'){await json(route,200,FIXTURE_THREAD_ID);return;}
      if(name==='lit_evaluate_my_achievements'||name==='lit_replace_work_taxonomy'||name==='lit_replace_my_taxonomy_v2_preferences'){await json(route,200,[]);return;}
      if(name==='lit_replace_my_profile_details'||name==='lit_update_my_profile') {
        const profile=tables.lit_profiles.find(profile=>profile.id===FIXTURE_USER_ID);
        if(name==='lit_update_my_profile')Object.assign(profile,body.p_profile);
        tables.lit_profile_favorite_books=(body.p_books||[]).map(book=>({user_id:FIXTURE_USER_ID,title:book.title,author_name:book.authorName,external_url:book.externalUrl}));
        tables.lit_profile_social_links=(body.p_links||[]).map(link=>({user_id:FIXTURE_USER_ID,...link}));
        tables.lit_profile_genre_preferences=[...(body.p_wanted_genres||[]).map(genre_id=>({user_id:FIXTURE_USER_ID,genre_id,preference:'wanted'})),...(body.p_unwanted_genres||[]).map(genre_id=>({user_id:FIXTURE_USER_ID,genre_id,preference:'unwanted'}))];
        tables.lit_profile_topic_preferences=[...(body.p_wanted_topics||[]).map(topic_id=>({user_id:FIXTURE_USER_ID,topic_id,preference:'wanted'})),...(body.p_unwanted_topics||[]).map(topic_id=>({user_id:FIXTURE_USER_ID,topic_id,preference:'unwanted'}))];
        await json(route,200,name==='lit_update_my_profile'?profile:{});return;
      }
      unknown.push(`${method} ${url.pathname}`);await json(route,400,{message:`Unknown fixture RPC: ${name}`});return;
    }
    if(url.pathname.startsWith('/rest/v1/')) {
      const table=url.pathname.slice('/rest/v1/'.length);
      if(!Object.hasOwn(tables,table)){unknown.push(`${method} ${url.pathname}`);await json(route,404,{message:`Unknown fixture table: ${table}`});return;}
      const selected=select(tables[table],url.searchParams);
      if(method==='GET'){await json(route,200,selected);return;}
      if(method==='POST') {
        const inserted=(Array.isArray(body)?body:[body]).map(row=>({id:id(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...row}));
        tables[table].push(...inserted);
        await json(route,201,inserted);return;
      }
      if(method==='PATCH'){for(const row of selected)Object.assign(row,body);await json(route,200,selected);return;}
      if(method==='DELETE'){tables[table]=tables[table].filter(row=>!selected.includes(row));await route.fulfill({status:204,body:''});return;}
    }
    unknown.push(`${method} ${url.pathname}`);await json(route,404,{message:'Unknown fixture endpoint'});
  });
  context.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  });
  const page=await context.newPage();
  return {context,page,requests,errors,dialogs,unknown,tables,objects,backend:{tables,objects},failNext,delayNext,
    async ready(path='/'){await page.goto(application.base+path,{waitUntil:'networkidle'});await page.locator(authenticated?'.app-shell':'.role-card').first().waitFor();},
    assertHealthy(){assert.deepEqual(unknown,[],'Every cloud request must be explicitly supported by the test fixture');assert.deepEqual(errors,[],'Unexpected browser errors');},
    async close(){await context.close();}};
}

function makeTables(profileExists) {
  const own={id:FIXTURE_USER_ID,username:'regression-author',nickname:'Регрессионный автор',first_name:'Тест',last_name:'Автора',account_role:'author',author_verified:true,is_admin:false,xp:20,reviewer_reputation:3,bio:'Исходное описание',avatar_path:null,banner_path:null,wanted_genres:[],unwanted_genres:[]};
  const peer={id:FIXTURE_PEER_ID,username:'regression-reader',nickname:'Регрессионный читатель',account_role:'reader',author_verified:false};
  const now=Date.now();
  const posts=[{id:FIXTURE_POST_ID,author_id:FIXTURE_PEER_ID,post_type:'text',body:'Опубликованный серверный пост',visibility:'public',created_at:new Date(now).toISOString()},...Array.from({length:49},(_,index)=>({id:`21000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,author_id:FIXTURE_PEER_ID,post_type:'text',body:`Пост ленты ${index+1}`,visibility:'public',created_at:new Date(now-index-1).toISOString()})),{id:FIXTURE_OLD_POST_ID,author_id:FIXTURE_PEER_ID,post_type:'text',body:'Старый пост вне первой страницы ленты',visibility:'public',created_at:'2020-01-01T00:00:00.000Z'}];
  return {
    lit_profiles:profileExists?[own,peer]:[peer],lit_genres:[{id:1,slug:'fantasy',name:'Фэнтези',sort_order:1,active:true}],lit_topics:[{id:1,slug:'adventure',name:'Приключения',group_name:'Общее',sort_order:1,active:true}],lit_work_formats:[{id:1,slug:'novel',name:'Роман',sort_order:1,active:true}],lit_audience_segments:[{id:1,slug:'all',name:'Все читатели',sort_order:1,active:true}],lit_tags:[{id:1,slug:'journey',name:'Путешествия',group_name:'Темы',sort_order:1,active:true,aliases:[]}],
    lit_profile_favorite_books:[],lit_profile_social_links:[],lit_profile_genre_preferences:[],lit_profile_topic_preferences:[],lit_profile_format_preferences:[],lit_profile_audience_preferences:[],lit_profile_tag_preferences:[],lit_follows:[],lit_user_achievements:[],lit_achievements:[],lit_notifications:[],lit_author_verification_requests:[],lit_reports:[],
    lit_posts:posts,lit_post_media:[],lit_post_reactions:[],lit_comments:[],lit_comment_reactions:[],lit_works:[],lit_work_versions:[],lit_reviews:[],lit_review_reactions:[],lit_work_genres:[],lit_work_audiences:[],lit_work_tags:[],lit_fragments:[],lit_review_annotations:[],lit_reading_progress:[],lit_editor_assets:[],
    lit_conversations:[{id:FIXTURE_THREAD_ID,conversation_type:'direct',created_by:FIXTURE_USER_ID,created_at:new Date(now).toISOString()},{id:FIXTURE_GROUP_ID,conversation_type:'project',title:'Редакционная группа',created_by:FIXTURE_USER_ID,created_at:new Date(now).toISOString()}],
    lit_conversation_members:[{conversation_id:FIXTURE_THREAD_ID,user_id:FIXTURE_USER_ID,role:'owner'},{conversation_id:FIXTURE_THREAD_ID,user_id:FIXTURE_PEER_ID,role:'member'},{conversation_id:FIXTURE_GROUP_ID,user_id:FIXTURE_USER_ID,role:'owner'},{conversation_id:FIXTURE_GROUP_ID,user_id:FIXTURE_PEER_ID,role:'member'}],
    lit_messages:[{id:'40000000-0000-4000-8000-000000000001',conversation_id:FIXTURE_THREAD_ID,sender_id:FIXTURE_PEER_ID,body:'Сообщение собеседника',created_at:new Date(now).toISOString()}],lit_calls:[],lit_call_signals:[]
  };
}

function select(rows,parameters) {
  let selected=rows.filter(row=>[...parameters].every(([key,value])=>{
    if(['select','order','limit','offset','on_conflict'].includes(key))return true;
    if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
    if(value.startsWith('neq.'))return String(row[key])!==value.slice(4);
    if(value.startsWith('ilike.'))return String(row[key]).toLowerCase()===value.slice(6).toLowerCase();
    if(value.startsWith('is.'))return value==='is.null'?row[key]==null:String(row[key])===value.slice(3);
    if(value.startsWith('gt.'))return row[key]>Number(value.slice(3));
    if(value.startsWith('in.('))return value.slice(4,-1).split(',').map(item=>item.replace(/^"|"$/g,'')).includes(String(row[key]));
    throw new Error(`Unsupported fixture query: ${key}=${value}`);
  }));
  const order=parameters.get('order');
  if(order) {
    const [field,direction]=order.split('.');
    selected=selected.slice().sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(direction==='desc'?-1:1));
  }
  if(parameters.has('limit'))selected=selected.slice(0,Number(parameters.get('limit')));
  return selected;
}

async function json(route,status,value){await route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});}
