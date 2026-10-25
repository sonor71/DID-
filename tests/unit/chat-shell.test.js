import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const {state}=await import('../../src/state.js');
const pages=await import('../../src/pages.js');
state.user={id:'self',role:'author',name:'Автор',nickname:'Автор',xp:0,reputation:0};

test('closed chat is excluded from keyboard access while its external control stays available',()=>{
  state.ui.chatPanelOpen=false;
  const html=pages.shell('<p>Основная страница</p>');
  const drawer=html.match(/<section\b[^>]*id="chatDrawer"[^>]*>/)?.[0];
  const control=html.match(/<button\b[^>]*aria-controls="chatDrawer"[^>]*>/)?.[0];
  assert.ok(drawer,'drawer region rendered');
  assert.match(drawer,/aria-hidden="true"/);
  assert.match(drawer,/\binert\b/);
  assert.ok(control,'independent accessible control rendered');
  assert.match(control,/aria-expanded="false"/);
  assert.doesNotMatch(control,/\binert\b|\bdisabled\b/);
});

test('open chat exposes matching accessibility state after a full rerender',()=>{
  state.ui.chatPanelOpen=true;
  const html=pages.shell('<p>Основная страница</p>');
  const drawer=html.match(/<section\b[^>]*id="chatDrawer"[^>]*>/)?.[0];
  assert.match(drawer,/aria-hidden="false"/);
  assert.doesNotMatch(drawer,/\binert\b/);
  assert.match(html,/<button\b[^>]*aria-controls="chatDrawer"[^>]*aria-expanded="true"/);
});

test('group messages do not offer active one-to-one call controls',()=>{
  state.chatThreads=[{id:'group',type:'group',title:'Группа',memberIds:[],messages:[]}];
  state.ui.selectedChatId='group';
  const group=pages.messagesPage();
  assert.doesNotMatch(group,/data-action="start-call"/);
  assert.match(group,/<button\b[^>]*disabled[^>]*>[^<]*Скоро/);
  state.chatThreads=[{id:'direct',type:'dm',title:'Друг',memberIds:[],messages:[]}];
  state.ui.selectedChatId='direct';
  assert.match(pages.messagesPage(),/data-action="start-call"[^>]*data-mode="audio"/);
});

test('unimplemented shared communities expose their limits instead of local publication controls',()=>{
  state.communities=[{id:'community',name:'Сообщество',description:'Описание',type:'Авторы',privacy:'public',members:2}];
  state.ui.selectedCommunityId='community';
  for(const html of [pages.communitiesPage(),pages.communityDetail()]){
    assert.doesNotMatch(html,/data-action="(?:create-community|join-community)"/);
    assert.match(html,/<button\b[^>]*disabled[^>]*>[^<]*Скоро/);
  }
  assert.doesNotMatch(pages.communityDetail(),/Закреплённое обсуждение/);
});

test('an unresolved newly selected thread never displays another conversation composer',()=>{
  state.chatThreads=[{id:'previous',type:'dm',title:'Предыдущий чат',memberIds:[],messages:[]}];
  state.ui.selectedChatId='new-cloud-conversation';
  assert.doesNotMatch(pages.messagesPage(),/class="[^"]*thread-message-form/);
});

test('blocked local persistence is visible and escaped in the application shell',()=>{
  state.ui.localSaveError='Не удалось сохранить <черновик> на этом устройстве';
  assert.match(pages.shell('<p>Редактор</p>'),/role="alert">Не удалось сохранить &lt;черновик&gt;/);
  state.ui.localSaveError=null;
});
