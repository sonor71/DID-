import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createFixtureContext,FIXTURE_GROUP_ID,FIXTURE_OLD_POST_ID,FIXTURE_ORIGIN,FIXTURE_POST_ID,FIXTURE_THREAD_ID,FIXTURE_USER_ID,startFixtureApplication} from '../helpers/browser-fixture.js';

let application;
test.before(async()=>{application=await startFixtureApplication();});
test.after(async()=>{await application?.close();});

async function waitFor(predicate,message) {
  for(let attempt=0;attempt<60;attempt++){if(await predicate())return;await delay(50);}
  assert.fail(message);
}

async function navigate(page,id) {
  const button=page.locator(`.sidebar [data-action="navigate"][data-page="${id}"]`);
  const bounds=await button.boundingBox();
  if(!bounds||bounds.x<0)await page.locator('.menu-toggle').click();
  await button.click();
  await waitFor(()=>page.locator('.sidebar [data-action="navigate"].active').evaluateAll((buttons,id)=>buttons.some(button=>button.dataset.page===id),id),`Navigation to ${id} did not complete`);
}

test('browser registration, OTP, login, logout and session restoration use the cloud client', {timeout:60000},async()=>{
  const fixture=await createFixtureContext(application,{authenticated:false,profileExists:false});
  const {page}=fixture;
  try {
    await fixture.ready();
    await page.locator('[data-action="choose-role"][data-role="reader"]').click();
    const registration=page.locator('#registrationOtpRequestForm');
    for(const [name,value] of Object.entries({nickname:'Новый читатель',username:'new-reader',firstName:'Ирина',lastName:'Тестовая',identifier:'reader@example.test'}))await registration.locator(`[name="${name}"]`).fill(value);
    fixture.delayNext.set('POST /auth/v1/otp',350);
    await registration.locator('button[type="submit"]').click();
    assert.equal(await registration.locator('button[type="submit"]').getAttribute('aria-busy'),'true');
    assert.equal(await registration.locator('button[type="submit"]').isDisabled(),true);
    await page.locator('#otpVerifyForm').waitFor();
    const registrationOtp=fixture.requests.find(request=>request.path==='/auth/v1/otp');
    assert.equal(registrationOtp.body.create_user,true);
    assert.equal(registrationOtp.body.data.username,'new-reader');
    await page.locator('#otpVerifyForm input[name="token"]').fill('123456');
    await page.locator('#otpVerifyForm button[type="submit"]').click();
    await page.locator('.app-shell').waitFor();
    assert.ok(fixture.requests.some(request=>request.path==='/rest/v1/lit_profiles'&&request.method==='POST'),'Missing literature profile must be created after verified registration');
    assert.equal(fixture.tables.lit_profiles.find(profile=>profile.id===FIXTURE_USER_ID).username,'new-reader');
    await page.locator('[data-action="cloud-logout"]').click();
    await page.locator('#loginOtpRequestForm').waitFor();
    assert.ok(fixture.requests.some(request=>request.path==='/auth/v1/logout'&&request.method==='POST'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('d20-supabase-session-v1')),null);
    await page.locator('#loginOtpRequestForm [name="identifier"]').fill('reader@example.test');
    await page.locator('#loginOtpRequestForm button[type="submit"]').click();
    await page.locator('#otpVerifyForm').waitFor();
    assert.equal(fixture.requests.filter(request=>request.path==='/auth/v1/otp').at(-1).body.create_user,false);
    await page.locator('#otpVerifyForm [name="token"]').fill('123456');
    await page.locator('#otpVerifyForm button[type="submit"]').click();
    await page.locator('.app-shell').waitFor();
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.app-shell').waitFor();
    assert.equal(fixture.requests.filter(request=>request.path==='/auth/v1/verify').length,2,'Restoring a persisted session must not repeat OTP');
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('an expired persisted session is refreshed before authenticated requests',{timeout:30000},async()=>{
  const fixture=await createFixtureContext(application,{expired:true});
  try {
    await fixture.ready();
    assert.ok(fixture.requests.some(request=>request.path==='/auth/v1/token'&&request.method==='POST'));
    const session=await fixture.page.evaluate(()=>JSON.parse(localStorage.getItem('d20-supabase-session-v1')));
    assert.ok(session.expires_at>Math.floor(Date.now()/1000));
    fixture.assertHealthy();
  } finally {await fixture.close();}
});

test('feed text/image posts, likes, comments and reactions persist through cloud requests',{timeout:45000},async()=>{
  const fixture=await createFixtureContext(application);
  const {page}=fixture;
  try {
    await fixture.ready();
    await page.locator('[data-action="open-post"]').click();
    await page.locator('#postForm [name="text"]').fill('Пост регрессионной проверки');
    await page.locator('#postForm button').click();
    await page.locator('.post-text').filter({hasText:'Пост регрессионной проверки'}).waitFor();
    const inserted=fixture.tables.lit_posts.find(post=>post.body==='Пост регрессионной проверки');
    assert.ok(inserted);assert.equal(inserted.author_id,FIXTURE_USER_ID);
    const card=page.locator('.post').filter({has:page.locator('.post-text',{hasText:'Пост регрессионной проверки'})});
    await card.locator('[data-action="like-post"]').click();
    await waitFor(()=>fixture.tables.lit_post_reactions.some(reaction=>reaction.post_id===inserted.id),'Like was not persisted');
    await card.locator('[data-action="open-post-comments"]').click();
    await page.locator('#postCommentForm [name="text"]').fill('Проверочный комментарий');
    await page.locator('#postCommentForm button').click();
    await page.locator('.post-comment').filter({hasText:'Проверочный комментарий'}).waitFor();
    const comment=fixture.tables.lit_comments.find(comment=>comment.body==='Проверочный комментарий');
    assert.equal(comment.post_id,inserted.id);
    await page.locator(`[data-action="react-post-comment"][data-id="${comment.id}"][data-kind="helpful"]`).click();
    await waitFor(()=>fixture.tables.lit_comment_reactions.some(reaction=>reaction.comment_id===comment.id&&reaction.reaction==='helpful'),'Comment reaction was not persisted');
    await page.locator(`[data-action="react-post-comment"][data-id="${comment.id}"][data-kind="helpful"].active`).waitFor();
    await page.locator('.modal [data-action="close-modal"]').click();
    await page.locator('[data-action="open-post"]').click();
    await page.locator('#postForm [name="text"]').fill('Изображение в посте');
    await page.locator('#postForm [name="media"]').setInputFiles('public/assets/icons/icon-192.png');
    await page.locator('#postForm button').click();
    const imageCard=page.locator('.post').filter({has:page.locator('.post-text',{hasText:'Изображение в посте'})});
    await imageCard.waitFor();
    await waitFor(()=>imageCard.locator('.post-media-grid img').evaluate(image=>image.complete&&image.naturalWidth>0),'Uploaded image post did not render');
    assert.ok(fixture.requests.some(request=>request.method==='POST'&&request.path.startsWith('/storage/v1/object/lit-post-media/')));
    assert.ok(fixture.tables.lit_post_media.some(media=>media.post_id===fixture.tables.lit_posts.find(post=>post.body==='Изображение в посте').id));
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('post sharing uses clipboard permalink and public deep links fetch posts outside the feed',{timeout:45000},async()=>{
  const fixture=await createFixtureContext(application);
  const {page}=fixture;
  try {
    await page.addInitScript(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
    await fixture.ready();
    await page.locator(`[data-action="share-post"][data-id="cloud:${FIXTURE_POST_ID}"]`).click();
    await page.locator('.toast').filter({hasText:'Ссылка скопирована'}).waitFor();
    const permalink=await page.evaluate(()=>navigator.clipboard.readText());
    assert.equal(permalink,`${application.base}/post/${FIXTURE_POST_ID}`);
    const publicFixture=await createFixtureContext(application,{authenticated:false});
    try {
      await publicFixture.page.goto(`${application.base}/post/${FIXTURE_OLD_POST_ID}`,{waitUntil:'networkidle'});
      await publicFixture.page.locator('.post-text').filter({hasText:'Старый пост вне первой страницы ленты'}).waitFor();
      assert.ok(publicFixture.requests.some(request=>request.path==='/rest/v1/lit_posts'&&request.query.includes(`id=eq.${FIXTURE_OLD_POST_ID}`)),'Deep link must fetch the specific post, independent of feed pagination');
      assert.ok(!publicFixture.requests.some(request=>request.path==='/auth/v1/otp'),'Public post views must not request an OTP');
      publicFixture.assertHealthy();
    } finally {await publicFixture.close();}
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('profile text, preferences, avatar and banner survive replacement, reload and removal',{timeout:60000},async()=>{
  const fixture=await createFixtureContext(application);
  const {page}=fixture;
  try {
    await fixture.ready();
    await page.locator('.avatar-btn[data-page="profile"]').click();
    await page.locator('[data-action="edit-profile"]').click();
    await page.locator('#profileForm [name="nickname"]').fill('Обновлённый автор');
    await page.locator('#profileForm [name="bio"]').fill('Изменение профиля проверено браузером');
    await page.locator('#profileForm .tag-options label').filter({has:page.locator('[name="wantedGenres"][value="1"]')}).click();
    assert.equal(await page.locator('#profileForm [name="wantedGenres"][value="1"]').isChecked(),true);
    await page.locator('#profileAvatarUpload').setInputFiles('public/assets/icons/icon-192.png');
    const own=()=>fixture.tables.lit_profiles.find(profile=>profile.id===FIXTURE_USER_ID);
    await waitFor(()=>Boolean(own().avatar_path),'Avatar upload did not update profile');
    const firstAvatar=own().avatar_path;
    await page.locator('#profileAvatarUpload').setInputFiles('public/assets/icons/icon-512.png');
    await waitFor(()=>own().avatar_path!==firstAvatar,'Replacing avatar must create a new immutable path');
    const currentAvatar=own().avatar_path;
    await waitFor(()=>!fixture.objects.has(`lit-avatars/${firstAvatar}`),'Previous avatar object must be removed after profile update succeeds');
    await page.locator('#profileBannerUpload').setInputFiles('public/assets/icons/icon-512.png');
    await waitFor(()=>Boolean(own().banner_path),'Banner upload did not update profile');
    const currentBanner=own().banner_path;
    await page.locator('#profileForm button.primary').click();
    await page.locator('.profile-main h1').filter({hasText:'Обновлённый автор'}).waitFor();
    assert.equal(own().bio,'Изменение профиля проверено браузером');
    assert.ok(fixture.tables.lit_profile_genre_preferences.some(row=>row.genre_id===1&&row.preference==='wanted'));
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.profile-main h1').filter({hasText:'Обновлённый автор'}).waitFor();
    const avatar=page.locator('.profile-avatar-v2 img');
    await waitFor(()=>avatar.evaluate(image=>image.complete&&image.naturalWidth>0),'Avatar did not restore after reload');
    assert.ok((await avatar.getAttribute('src')).endsWith(currentAvatar));
    const banner=page.locator('.profile-banner img');
    await waitFor(()=>banner.evaluate(image=>image.complete&&image.naturalWidth>0),'Banner did not restore after reload');
    assert.ok((await banner.getAttribute('src')).endsWith(currentBanner));
    await page.locator('[data-action="edit-profile"]').click();
    await page.locator('[data-action="remove-profile-media"][data-kind="avatar"]').click();
    await waitFor(()=>own().avatar_path===null,'Avatar removal must clear the cloud field');
    await page.locator('[data-action="remove-profile-media"][data-kind="banner"]').click();
    await waitFor(()=>own().banner_path===null,'Banner removal must clear the cloud field');
    assert.equal(fixture.objects.has(`lit-avatars/${currentAvatar}`),false);
    assert.equal(fixture.objects.has(`lit-profile-banners/${currentBanner}`),false);
    await page.locator('.modal [data-action="close-modal"]').click();
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.profile-v2').waitFor();
    assert.equal(await page.locator('.profile-avatar-v2 img').count(),0);
    assert.equal(await page.locator('.profile-banner img').count(),0);
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('native sharing handles success, cancellation and errors without silently copying',{timeout:30000},async()=>{
  const fixture=await createFixtureContext(application);
  const {page}=fixture;
  try {
    await page.addInitScript(()=>{
      window.__sharePayloads=[];window.__clipboardWrites=[];window.__shareOutcome='success';
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(value){window.__clipboardWrites.push(value);}}});
      Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__sharePayloads.push(payload);if(window.__shareOutcome==='cancel')throw Object.assign(new Error('Cancelled'),{name:'AbortError'});if(window.__shareOutcome==='error')throw new Error('Sharing denied');}});
    });
    await fixture.ready();
    const share=page.locator(`[data-action="share-post"][data-id="cloud:${FIXTURE_POST_ID}"]`);
    await share.click();
    await waitFor(()=>page.evaluate(()=>window.__sharePayloads.length===1),'Web Share API was not invoked');
    assert.equal(await page.evaluate(()=>window.__sharePayloads[0].url),`${application.base}/post/${FIXTURE_POST_ID}`);
    await page.locator('.toast').filter({hasText:'Пост отправлен'}).waitFor();
    await page.evaluate(()=>{window.__shareOutcome='cancel';});
    await share.click();
    await waitFor(()=>page.evaluate(()=>window.__sharePayloads.length===2),'Second share was not invoked');
    assert.equal(await page.locator('.toast').evaluateAll(nodes=>nodes.every(node=>node.textContent==='Пост отправлен')),true,'Cancellation must not add an error; an earlier success toast may finish its display interval');
    await page.evaluate(()=>{window.__shareOutcome='error';});
    await share.click();
    await page.locator('.toast').filter({hasText:'Sharing denied'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__clipboardWrites),[],'Native cancellation/errors must not silently write clipboard');
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('clipboard sharing errors produce visible feedback',{timeout:30000},async()=>{
  const fixture=await createFixtureContext(application);
  try {
    await fixture.page.addInitScript(()=>{
      Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(){throw new Error('Clipboard denied');}}});
    });
    await fixture.ready();
    await fixture.page.locator(`[data-action="share-post"][data-id="cloud:${FIXTURE_POST_ID}"]`).click();
    await fixture.page.locator('.toast').filter({hasText:'Clipboard denied'}).waitFor();
    fixture.assertHealthy();
  } finally {await fixture.close();}
});

for(const width of [360,390,430,1366,1920]) {
  test(`navigation and attached chat drawer remain usable at ${width}px`,{timeout:45000},async()=>{
    const fixture=await createFixtureContext(application,{width});
    const {page}=fixture;
    try {
      await fixture.ready();
      for(const id of ['evaluate','read','library','create','feedback','messages','home'])await navigate(page,id);
      await page.locator('.avatar-btn[data-page="profile"]').click();
      await page.locator('.profile-v2').waitFor();
      await navigate(page,'home');
      const toggle=page.locator('.chat-edge-toggle');
      await toggle.click();
      await page.locator('.chat-shell.is-open').waitFor();
      assert.equal(await page.locator('#chatDrawer').evaluate(drawer=>drawer.inert),false);
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      const edge=await toggle.boundingBox();
      const drawer=await page.locator('#chatDrawer').boundingBox();
      assert.ok(edge&&drawer);
      assert.ok(Math.abs(edge.x+edge.width-drawer.x)<=2,'Edge toggle must be physically attached to drawer left edge');
      assert.ok(edge.x>=-1&&edge.x+edge.width<=width+1,'Toggle must remain within viewport');
      assert.ok(drawer.x>=43&&drawer.x+drawer.width<=width+1,'Drawer must retain its own toggle space');
      const visibleHit=await toggle.evaluate(button=>{const bounds=button.getBoundingClientRect();return document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)===button;});
      assert.equal(visibleHit,true,'Drawer must not cover its own toggle');
      await page.locator(`[data-action="open-thread"][data-id="${FIXTURE_THREAD_ID}"]`).click();
      const messageForm=page.locator(`.thread-message-form[data-thread="${FIXTURE_THREAD_ID}"]`).last();
      await messageForm.locator('[name="message"]').fill(`Сообщение ${width}`);
      await messageForm.locator('button').click();
      await waitFor(()=>fixture.tables.lit_messages.some(message=>message.body===`Сообщение ${width}`),'Direct message was not sent');
      await page.locator('[data-action="chat-tab"][data-tab="groups"]').click();
      await page.locator(`[data-action="open-thread"][data-id="${FIXTURE_GROUP_ID}"]`).click();
      assert.ok(await page.locator('.drawer-chat-head').textContent().then(text=>text.includes('Редакционная группа')));
      await toggle.click();
      await page.locator('.chat-shell:not(.is-open)').waitFor();
      assert.equal(await page.locator('#chatDrawer').evaluate(drawer=>drawer.inert),true);
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      const closedEdge=await toggle.boundingBox();
      assert.ok(closedEdge.x>=-1&&closedEdge.x+closedEdge.width<=width+1,'Closed toggle must remain available');
      const motion=await page.locator('.chat-panel').evaluate(panel=>getComputedStyle(panel).transitionDuration);
      assert.ok(motion.split(',').every(value=>parseFloat(value)<=0.01),'Reduced motion must disable the drawer animation');
      const deadButtons=await page.locator('button:visible:not([disabled])').evaluateAll(buttons=>buttons.filter(button=>!button.dataset.action&&!button.closest('form')&&!button.matches('.canvas-move-handle,.canvas-resize-handle,[data-editor-tool],[data-command]')).map(button=>button.textContent.trim()));
      assert.deepEqual(deadButtons,[],'Visible active buttons must have an action or form handler');
      fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
    } finally {await fixture.close();}
  });
}

test('browser history restores route and scroll with native transitions and CSS fallback',{timeout:30000},async()=>{
  const fixture=await createFixtureContext(application,{width:1366});
  const {page}=fixture;
  try{
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.addInitScript(()=>{
      window.__navigationTransitions=0;
      const start=document.startViewTransition;
      if(start)document.startViewTransition=function(update){window.__navigationTransitions++;return start.call(this,update);};
    });
    await fixture.ready();
    await page.evaluate(()=>window.scrollTo(0,600));
    await waitFor(()=>page.evaluate(()=>window.scrollY>=599),'Home must have scrollable content');
    await navigate(page,'read');
    assert.ok((await page.evaluate(()=>window.scrollY))<=1);
    assert.ok((await page.evaluate(()=>window.__navigationTransitions))>0,'Native view transition must be used when available');
    await page.goBack();
    await waitFor(()=>page.evaluate(()=>location.pathname==='/'&&window.scrollY>=599),'Back must restore route and its scroll position');
    await page.goForward();
    await waitFor(()=>page.evaluate(()=>location.pathname==='/read'&&window.scrollY<=1),'Forward must restore destination and top scroll');
    await page.evaluate(()=>{
      document.startViewTransition=undefined;window.__navigationFallback=false;
      new globalThis.MutationObserver(()=>{if(document.querySelector('.page.navigation-enter'))window.__navigationFallback=true;}).observe(document.body,{attributes:true,childList:true,subtree:true});
    });
    await navigate(page,'library');
    assert.equal(await page.evaluate(()=>window.__navigationFallback),true);
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  }finally{await fixture.close();}
});

test('delayed chat refresh cannot erase a new message or restore an older selected thread',{timeout:45000},async()=>{
  const fixture=await createFixtureContext(application);
  const {page}=fixture;
  try {
    await fixture.ready('/messages');
    const groupPrefix=`GET /rest/v1/lit_messages?conversation_id=eq.${FIXTURE_GROUP_ID}`;
    fixture.delayNext.set(groupPrefix,500);
    const groupResponse=page.waitForResponse(response=>response.url().includes(`/rest/v1/lit_messages?conversation_id=eq.${FIXTURE_GROUP_ID}`));
    await page.locator(`.chat-list [data-action="select-thread"][data-id="${FIXTURE_GROUP_ID}"]`).click();
    await waitFor(()=>fixture.requests.some(request=>`${request.method} ${request.path}${request.query}`.startsWith(groupPrefix)),'Selected group refresh did not start');
    const groupForm=page.locator(`.page .thread-message-form[data-thread="${FIXTURE_GROUP_ID}"]`);
    await groupForm.locator('[name="message"]').fill('Сообщение во время загрузки');
    await groupForm.locator('button').click();
    await waitFor(()=>fixture.tables.lit_messages.some(message=>message.body==='Сообщение во время загрузки'),'In-flight refresh lost the newly typed message');
    await groupResponse;
    assert.equal(fixture.requests.filter(request=>request.path==='/rest/v1/lit_messages'&&request.method==='POST'&&request.body.body==='Сообщение во время загрузки').length,1);
    const directPrefix=`GET /rest/v1/lit_messages?conversation_id=eq.${FIXTURE_THREAD_ID}`;
    fixture.delayNext.set(directPrefix,500);
    const oldResponse=page.waitForResponse(response=>response.url().includes(`/rest/v1/lit_messages?conversation_id=eq.${FIXTURE_THREAD_ID}`));
    await page.locator(`.chat-list [data-action="select-thread"][data-id="${FIXTURE_THREAD_ID}"]`).click();
    await waitFor(()=>!fixture.delayNext.has(directPrefix),'Delayed direct-thread refresh did not start');
    await page.locator(`.chat-list [data-action="select-thread"][data-id="${FIXTURE_GROUP_ID}"]`).click();
    await oldResponse;
    await page.locator(`.page .thread-message-form[data-thread="${FIXTURE_GROUP_ID}"]`).waitFor();
    assert.equal(await page.locator('.chat-list [data-action="select-thread"].active').getAttribute('data-id'),FIXTURE_GROUP_ID);
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

for(const project of [
  {name:'document',type:'work',mode:'document'},
  {name:'book',type:'work',mode:'book'},
  {name:'draft',type:'draft',mode:'document'},
  {name:'fragment',type:'fragment',mode:'document'}
]) {
  test(`structured ${project.name} media survives gestures, cloud save, reload and a fresh browser context`,{timeout:90000},async()=>{
    const fixture=await createFixtureContext(application,{width:1920,height:1200});
    const {page}=fixture;
    const content=()=>project.type==='fragment'?fixture.tables.lit_fragments.at(-1)?.content:fixture.tables.lit_work_versions.at(-1)?.content;
    const savedImages=()=>[...(content()?.documentPages||[]),...(content()?.bookPages||[])].flatMap(page=>(page.canvas?.objects||[]).filter(object=>object.type==='image'));
    try {
      await fixture.ready();
      await navigate(page,'create');
      await page.locator('[data-action="new-work"]').first().click();
      await page.locator(`[data-action="set-create-type"][data-type="${project.type}"]`).click();
      await page.locator(`[data-action="start-create-project"][data-type="${project.type}"][data-mode="${project.mode}"]`).click();
      await page.locator('#freePageCanvas').waitFor();
      if(project.mode==='book')await page.locator('[data-action="book-page-select"][data-index="2"]').click();
      await page.locator('.project-meta > summary').click();
      await page.locator('#workEditor [name="title"]').fill(`Медиа ${project.name}`);
      await page.locator('#workEditor [name="summary"]').fill('Описание произведения для регрессионной проверки публикации.');
      await page.locator('.project-meta label').filter({has:page.locator('[name="genres"][value="Фэнтези"]')}).click();
      await page.locator('.canvas-text-content').first().fill('Текст вокруг иллюстрации. '.repeat(20));
      await page.locator('#mediaUpload').setInputFiles('public/assets/icons/icon-192.png');
      await page.locator('.canvas-image-object').waitFor();
      const imageId=await page.locator('.canvas-image-object').getAttribute('data-object-id');
      const image=()=>page.locator(`.canvas-image-object[data-object-id="${imageId}"]`);
      await waitFor(()=>image().locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),'Uploaded editor image did not decode');
      assert.ok(fixture.tables.lit_editor_assets.length===1,'Upload must create a persistent asset record');
      await page.locator('#canvasMediaLayout').selectOption('free');
      const beforeMove=await image().evaluate(image=>({x:Number(image.dataset.x),y:Number(image.dataset.y),w:Number(image.dataset.w),h:Number(image.dataset.h)}));
      const move=image().locator('.canvas-move-handle');
      await move.scrollIntoViewIfNeeded();
      const handle=await move.boundingBox();
      assert.ok(handle,'Image move handle must be visible');
      await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
      await page.mouse.move(handle.x+handle.width/2+55,handle.y+handle.height/2+35,{steps:6});await page.mouse.up();
      const moved=await image().evaluate(image=>({x:Number(image.dataset.x),y:Number(image.dataset.y)}));
      assert.ok(moved.x>beforeMove.x+5&&moved.y>beforeMove.y+5,'Dragging must update persisted page coordinates');
      const resize=image().locator('.canvas-resize-handle.handle-se');
      await resize.scrollIntoViewIfNeeded();
      const corner=await resize.boundingBox();
      assert.ok(corner,'Image resize handle must be visible');
      await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();
      await page.mouse.move(corner.x+corner.width/2+45,corner.y+corner.height/2+35,{steps:6});await page.mouse.up();
      const resized=await image().evaluate(image=>({w:Number(image.dataset.w),h:Number(image.dataset.h)}));
      assert.ok(resized.w>beforeMove.w&&resized.h>beforeMove.h,'Resize gesture must change image dimensions');
      await page.locator('#canvasMediaLayout').selectOption('flow');
      await page.locator('#canvasMediaWrap').selectOption('left');
      const leftX=Number(await image().getAttribute('data-x'));
      await page.locator('#canvasMediaWrap').selectOption('right');
      assert.ok(Number(await image().getAttribute('data-x'))>leftX,'Right wrap must move image to the opposite text edge');
      assert.ok(await page.locator('.canvas-wrap-proxy').count()>0,'Flow images must create real text exclusion regions');
      await page.locator('#canvasMediaLayout').selectOption('free');
      await page.locator('#canvasMediaCaption').fill('Структурированная подпись');await page.locator('#canvasMediaCaption').press('Tab');
      await page.locator('#mediaUpload').setInputFiles('public/assets/icons/icon-512.png');
      await waitFor(()=>page.locator('.canvas-image-object').count().then(count=>count===2),'Multiple images must coexist');
      await page.locator('[data-action="canvas-delete"]').click();
      await waitFor(()=>page.locator('.canvas-image-object').count().then(count=>count===1),'Deleting the selected image must retain the other image');
      await page.keyboard.press('Control+z');
      await waitFor(()=>page.locator('.canvas-image-object').count().then(count=>count===2),'Undo must restore deleted image');
      await page.keyboard.press('Control+Shift+z');
      await waitFor(()=>page.locator('.canvas-image-object').count().then(count=>count===1),'Redo must delete the same image again');
      await waitFor(()=>savedImages().length===1&&savedImages()[0].id===imageId,'Autosave must persist structured images to the cloud');
      await page.locator('[data-action="save-work"]').click();
      await page.locator('.word-status [data-save-status="saved"]').waitFor();
      await image().click();
      await page.locator('#canvasMediaCaption').fill('Продолжение после сохранения');await page.locator('#canvasMediaCaption').press('Tab');
      await waitFor(()=>savedImages()[0]?.caption==='Продолжение после сохранения','Explicit saving must leave the live editor attached to its work identity');
      const persisted=savedImages()[0];
      if(project.type!=='fragment'){
        assert.equal(fixture.tables.lit_works.at(-1).title,`Медиа ${project.name}`);
        assert.equal(fixture.tables.lit_works.at(-1).summary,'Описание произведения для регрессионной проверки публикации.');
        assert.deepEqual(fixture.tables.lit_works.at(-1).genres,['Фэнтези']);
      }
      for(const field of ['id','assetId','assetPath','pageId','x','y','width','height','zIndex','layoutMode','wrapMode','alt','caption'])assert.ok(Object.hasOwn(persisted,field),`Persisted image missing ${field}`);
      assert.ok(persisted.assetPath.startsWith(`${FIXTURE_USER_ID}/`));
      assert.ok(!/\b(?:data|blob):/i.test(JSON.stringify(content())),'Cloud content must not contain binary/temporary media URLs');
      assert.ok(!/\b(?:data|blob):/i.test(await page.evaluate(()=>localStorage.getItem('d20-platform-v4'))),'Local state must not persist binary/temporary media URLs');
      assert.ok(persisted.x>=0&&persisted.y>=0&&persisted.x+persisted.width<=760&&persisted.y+persisted.height<=1080,'Media must remain within page bounds');
      if(project.type==='fragment') {
        await page.locator('[data-action="publish-evaluation"]').click();
        await waitFor(()=>fixture.tables.lit_fragments.at(-1)?.visibility==='public','Publishing a fragment must update the cloud fragment visibility');
      } else if(project.type==='work') {
        await page.locator('[data-action="open-publish-checklist"]').click();
        assert.equal(await page.locator('[data-action="confirm-publish-work"]').isEnabled(),true,await page.locator('.publish-checks').innerText());
        await page.locator('[data-action="confirm-publish-work"]').click();
        await waitFor(()=>fixture.tables.lit_works.at(-1)?.status==='published'&&Boolean(fixture.tables.lit_work_versions.at(-1)?.published_at),'Publishing must update the work and version in the cloud');
      } else assert.equal(fixture.tables.lit_works.at(-1)?.status,'draft','A private draft must remain unpublished');
      await page.reload({waitUntil:'networkidle'});
      await image().waitFor();
      await waitFor(()=>image().locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),'Editor image must restore after reload');
      const fresh=await createFixtureContext(application,{width:1920,height:1200,backend:fixture.backend});
      try {
        await fresh.ready('/create');
        if(project.mode==='book')await fresh.page.locator('[data-action="book-page-select"][data-index="2"]').click();
        const restored=fresh.page.locator(`.canvas-image-object[data-object-id="${imageId}"]`);
        await restored.waitFor();
        await waitFor(()=>restored.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),'Fresh browser context must recover the cloud image without local work state');
        assert.equal(await restored.getAttribute('data-caption'),'Продолжение после сохранения');
        fresh.assertHealthy();
      } finally {await fresh.close();}
      fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
    } finally {await fixture.close();}
  });
}

test('legacy figure media migrates without losing text and a broken image exposes a retry UI',{timeout:45000},async()=>{
  const fixture=await createFixtureContext(application,{width:1920,height:1200});
  const {page}=fixture;
  const source=`${FIXTURE_ORIGIN}/storage/v1/object/public/lit-work-assets/${FIXTURE_USER_ID}/legacy.png`;
  const objectKey=`lit-work-assets/${FIXTURE_USER_ID}/legacy.png`;
  const legacy={works:[{id:'legacy-work',authorId:FIXTURE_USER_ID,author:'Автор',title:'Старый документ',kind:'Роман',genres:[],version:'1',editorMode:'document',creationType:'work',content:'Текст до иллюстрации. Текст после иллюстрации.',documentPages:[{id:'legacy-page',html:`<p>Текст до иллюстрации.</p><figure class="embedded-media wrap-right" style="width:40%"><img src="${source}" alt="Старая иллюстрация"><figcaption>Старая подпись</figcaption></figure><p>Текст после иллюстрации.</p>`}]}],ui:{page:'create',selectedStudioWorkId:'legacy-work'}};
  try {
    await page.addInitScript(legacy=>{if(!localStorage.getItem('legacy-fixture-installed')){localStorage.setItem('d20-platform-v4',JSON.stringify(legacy));localStorage.setItem('legacy-fixture-installed','1');}},legacy);
    await fixture.ready('/create');
    const image=page.locator('.canvas-image-object');
    await image.waitFor();
    assert.equal(await image.getAttribute('data-layout-mode'),'flow');
    assert.equal(await image.getAttribute('data-wrap-mode'),'right');
    assert.equal(await image.getAttribute('data-caption'),'Старая подпись');
    const text=await page.locator('.canvas-text-content').innerText();
    assert.match(text,/Текст до иллюстрации/);assert.match(text,/Текст после иллюстрации/);
    assert.equal(await page.locator('.canvas-text-content figure,.canvas-text-content img').count(),0,'Legacy image HTML must not remain a second media store');
    await image.click();
    await page.locator('#canvasMediaCaption').fill('Перенесённая подпись');await page.locator('#canvasMediaCaption').press('Tab');
    await waitFor(()=>fixture.tables.lit_work_versions.at(-1)?.content.documentPages?.[0]?.canvas.objects.some(object=>object.type==='image'&&object.caption==='Перенесённая подпись'),'Migrated figure must be saved as structured media');
    fixture.objects.set(objectKey,{body:Buffer.from('not a PNG image'),contentType:'image/png'});
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.canvas-image-object .media-load-error:not([hidden])').waitFor();
    assert.match(await page.locator('.canvas-image-object .media-load-error').innerText(),/Не удалось загрузить изображение/);
    fixture.objects.delete(objectKey);
    await page.locator('.canvas-image-object [data-action="retry-media-image"]').click();
    await waitFor(()=>page.locator('.canvas-image-object > img').evaluate(image=>image.complete&&image.naturalWidth>0),'Retry must recover the image after storage becomes available');
    assert.equal(await page.locator('.canvas-image-object .media-load-error').isHidden(),true);
    fixture.assertHealthy();assert.deepEqual(fixture.dialogs,[]);
  } finally {await fixture.close();}
});

test('PWA icons are served as PNG with manifest dimensions and decode in the browser',{timeout:30000},async()=>{
  const fixture=await createFixtureContext(application,{authenticated:false});
  try {
    await fixture.ready();
    const manifest=await (await fetch(`${application.base}/manifest.webmanifest`)).json();
    for(const icon of manifest.icons) {
      const response=await fetch(application.base+icon.src);
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^image\/png/);
      const bytes=Buffer.from(await response.arrayBuffer());
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
      const dimensions=await fixture.page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return `${image.naturalWidth}x${image.naturalHeight}`;},icon.src);
      assert.equal(dimensions,icon.sizes);
    }
    assert.ok(fs.existsSync('public/assets/icons/icon-180.png'));
    fixture.assertHealthy();
  } finally {await fixture.close();}
});
