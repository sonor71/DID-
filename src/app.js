import {state,update,reset,save,xpToLevel} from './state.js';
import {ANNOTATION_TYPES,FEEDBACK_CATEGORIES,GENRES} from './data.js';
import * as pages from './pages.js';
import {esc,modal,toast} from './ui.js';
import {ensureSession,getSession,signOut,getMyProfile,updateMyProfile,fetchPublicFeed,createCloudPost,toggleCloudPostLike,fetchPostComments,createCloudComment,setCloudCommentReaction,isCloudAuthenticated,requestOtp,verifyOtp,createMyProfile,checkServerConnection,findProfileByUsername,getOrCreateDirectConversation,createCloudGroupConversation,fetchMyConversations,fetchConversationMessages,sendCloudMessage,getConversationPeer,createCloudCall,fetchIncomingCalls,getCloudCall,setCloudCallStatus,sendCloudCallSignal,fetchCloudCallSignals,fetchNotifications,markNotificationRead,markAllNotificationsRead,createReport,fetchModerationReports,setModerationReportStatus,requestAuthorVerification,fetchMyVerificationRequests,fetchVerificationRequests,resolveAuthorVerification,fetchCloudLiterature,saveCloudWork,saveCloudReview,setCloudReviewReaction,saveCloudReadingProgress} from './cloud.js';

const app=document.querySelector('#app');
let signupRole=null;
let loginMode=false;
let forceAuthScreen=false;
let authMethod='email';
let otpPending=null;
let cloudFeedLoaded=false;
let readerFont=18;
let readerTheme=0;
let animateChatOpen=false;
let savedEditorRange=null;
let selectedMediaFigure=null;
let selectedCanvasObject=null;
const PAGE_CANVAS_W=760;
const PAGE_CANVAS_H=1080;
let studioAutosaveTimer=null;
let bookFlipLocked=false;
let swipeStartX=null;
let authReady=false;
let chatsPollTimer=null;
let incomingCallTimer=null;
let notificationsTimer=null;
let activeRtc=null;
let callSignalTimer=null;
const seenIncomingCalls=new Set();

function render(){
  if(!authReady){app.innerHTML='<main class="onboarding"><section class="onboard-card"><h2>Подключение к FRAKTUM…</h2><p class="muted">Проверяем сессию Supabase.</p></section></main>';return;}
  if(!isCloudAuthenticated()||!state.user||forceAuthScreen){ const auth={method:authMethod,pending:otpPending,fromApp:false}; app.innerHTML= loginMode?pages.loginPage(auth):(signupRole?pages.registration(signupRole,auth):pages.onboarding()); attachSpecial(); return; }
  const map={home:pages.home,evaluate:pages.evaluatePage,evaluation:pages.evaluationSession,read:pages.readDiscovery,work:pages.workDetailPage,reader:pages.readerPage,library:pages.library,create:pages.createPage,notes:pages.notesPage,specialists:pages.specialistsPage,communities:pages.communitiesPage,community:pages.communityDetail,messages:pages.messagesPage,journal:pages.journalPage,profile:pages.profilePage,analytics:pages.analyticsPage,admin:pages.adminPage};
  app.innerHTML=(map[state.ui.page]||pages.home)();
  if(state.ui.modal) app.insertAdjacentHTML('beforeend',state.ui.modal);
  if(state.ui.toast){ app.insertAdjacentHTML('beforeend',toast(state.ui.toast)); setTimeout(()=>{update(s=>s.ui.toast=null,{persist:false}); const t=document.querySelector('.toast'); if(t)t.remove();},1800); }
  attachSpecial();
  animateDrawerIfNeeded();
}

function animateDrawerIfNeeded(){
  if(!animateChatOpen||!state.ui.chatPanelOpen)return;
  const drawer=document.querySelector('.chat-drawer');
  if(!drawer){animateChatOpen=false;return;}
  drawer.classList.remove('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>drawer.classList.add('open')));
  animateChatOpen=false;
}

function toggleChatPanel(){
  const opening=!state.ui.chatPanelOpen;
  update(s=>s.ui.chatPanelOpen=opening,{persist:false});
  const drawer=document.querySelector('.chat-drawer');
  const toggles=document.querySelectorAll('[data-action="toggle-chat-panel"]');
  if(drawer) drawer.classList.toggle('open',opening);
  toggles.forEach(btn=>{if(btn.classList.contains('dock-toggle'))btn.textContent=opening?'›':'‹';});
}

function notify(text){ update(s=>s.ui.toast=text,{persist:false}); render(); }
function go(page){ update(s=>{s.ui.page=page;s.ui.modal=null;s.ui.sidebarOpen=false;},{persist:false}); render(); }
function openModal(html,size){ update(s=>s.ui.modal=modal(html,size),{persist:false}); render(); }
function closeModal(){ update(s=>s.ui.modal=null,{persist:false}); render(); }

function attachSpecial(){
  const reg=document.querySelector('#registrationOtpRequestForm'); if(reg) reg.addEventListener('submit',handleRegistrationOtpRequest);
  const login=document.querySelector('#loginOtpRequestForm'); if(login) login.addEventListener('submit',handleLoginOtpRequest);
  const verify=document.querySelector('#otpVerifyForm'); if(verify) verify.addEventListener('submit',handleOtpVerify);
  const text=document.querySelector('#readerText');
  if(text){
    text.style.fontSize=`${readerFont}px`; text.dataset.theme=String(readerTheme); text.addEventListener('mouseup',captureSelection);
    if(state.ui.page==='reader') attachReadingProgress(text);
  }
  const global=document.querySelector('#globalSearch'); if(global) global.addEventListener('keydown',e=>{if(e.key==='Enter') searchGlobal(e.target.value)});
  document.querySelectorAll('.rich-editor,.canvas-text-content,[data-book-field]').forEach(ed=>{
    ed.addEventListener('mouseup',()=>{rememberEditorSelection();syncEditorToolbar();});
    ed.addEventListener('keyup',()=>{rememberEditorSelection();updateEditorWordCount();syncEditorToolbar();scheduleStudioAutosave();});
    ed.addEventListener('input',()=>{updateEditorWordCount();scheduleStudioAutosave();});
    ed.addEventListener('keydown',handleEditorShortcuts);
  });
  const ribbon=document.querySelector('.word-ribbon');
  if(ribbon) ribbon.addEventListener('pointerdown',e=>{if(!e.target.closest('input[type="color"]'))rememberEditorSelection();},true);
  document.querySelectorAll('[data-editor-tool]').forEach(control=>{
    control.addEventListener('change',()=>applyEditorTool(control.dataset.editorTool,control.value));
    if(control.type==='color') control.addEventListener('input',()=>applyEditorTool(control.dataset.editorTool,control.value));
  });
  const upload=document.querySelector('#mediaUpload'); if(upload) upload.addEventListener('change',handleMediaUpload);
  const widthSlider=document.querySelector('#mediaWidthSlider');
  if(widthSlider) widthSlider.addEventListener('input',()=>setMediaSize(widthSlider.value,true));
  const gapSlider=document.querySelector('#mediaGapSlider');
  if(gapSlider) gapSlider.addEventListener('input',()=>setMediaGap(gapSlider.value,true));
  attachMediaInteractions();
  updateMediaControls();
  attachCanvasInteractions();
  attachCanvasWrapProxies();
  updateCanvasInspector();
  const bgColor=document.querySelector('#pageBackgroundColor'); if(bgColor) bgColor.addEventListener('input',()=>setPageBackgroundColor(bgColor.value));
  const textColor=document.querySelector('#pageTextColor'); if(textColor) textColor.addEventListener('input',()=>setPageTextColor(textColor.value));
  const bgFit=document.querySelector('#pageBackgroundFit'); if(bgFit) bgFit.addEventListener('change',()=>setPageBackgroundFit(bgFit.value));
  const rot=document.querySelector('#canvasRotationSlider'); if(rot) rot.addEventListener('input',()=>setCanvasObjectProperty('rotation',rot.value,true));
  const op=document.querySelector('#canvasOpacitySlider'); if(op) op.addEventListener('input',()=>setCanvasObjectProperty('opacity',Number(op.value)/100,true));
  const rad=document.querySelector('#canvasRadiusSlider'); if(rad) rad.addEventListener('input',()=>setCanvasObjectProperty('radius',rad.value,true));
  const fit=document.querySelector('#canvasImageFit'); if(fit) fit.addEventListener('change',()=>setCanvasObjectProperty('fit',fit.value));
  const wrap=document.querySelector('#canvasImageWrap'); if(wrap) wrap.addEventListener('change',()=>setCanvasObjectProperty('wrap',wrap.value));
  const gap=document.querySelector('#canvasWrapGapSlider'); if(gap) gap.addEventListener('input',()=>setCanvasObjectProperty('gap',gap.value,true));
  const tbg=document.querySelector('#canvasTextBgColor'); if(tbg) tbg.addEventListener('input',()=>setCanvasObjectProperty('textBg',tbg.value,true));
  const tbgm=document.querySelector('#canvasTextBgMode'); if(tbgm) tbgm.addEventListener('change',()=>setCanvasObjectProperty('textBgMode',tbgm.value));
  const tflow=document.querySelector('#canvasTextFlow'); if(tflow) tflow.addEventListener('change',()=>setCanvasObjectProperty('flow',tflow.value));
  attachBookSwipe();
  updateEditorWordCount();
  syncEditorToolbar();
}

function scheduleStudioAutosave(){
  clearTimeout(studioAutosaveTimer);
  studioAutosaveTimer=setTimeout(()=>{if(document.querySelector('#workEditor')){syncStudioEditor();save();const label=document.querySelector('.word-status span:last-child');if(label&&!state.ui.bookViewMode)label.dataset.saved='1';}},650);
}

function handleEditorShortcuts(e){
  if(!(e.ctrlKey||e.metaKey))return;
  const k=e.key.toLowerCase();
  const map={b:'bold',i:'italic',u:'underline'};
  if(map[k]){e.preventDefault();rememberEditorSelection();execEditorCommand(map[k]);return;}
  if(k==='s'){e.preventDefault();syncStudioEditor();save();notify('Черновик сохранён локально');}
}

function attachBookSwipe(){
  document.querySelectorAll('.book-preview-scene,.reader-book-scene').forEach(scene=>{
    scene.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;swipeStartX=e.clientX;});
    scene.addEventListener('pointerup',e=>{if(swipeStartX==null)return;const dx=e.clientX-swipeStartX;swipeStartX=null;if(Math.abs(dx)<55)return;const reader=scene.classList.contains('reader-book-scene');const action=dx<0?(reader?'reader-book-next':'book-spread-next'):(reader?'reader-book-prev':'book-spread-prev');const btn=scene.querySelector(`[data-action="${action}"]`);if(btn&&!btn.disabled)btn.click();});
  });
}

function cleanEditorHtml(el){
  const clone=el.cloneNode(true);
  clone.querySelectorAll('.media-drag-handle,.media-resize-handle').forEach(x=>x.remove());
  clone.querySelectorAll('.embedded-media').forEach(x=>x.classList.remove('selected','dragging'));
  return clone.innerHTML;
}

function selectMediaFigure(figure){
  document.querySelectorAll('.rich-editor .embedded-media.selected').forEach(x=>x.classList.remove('selected'));
  selectedMediaFigure=figure||null;
  if(figure)figure.classList.add('selected');
  updateMediaControls();
}
function updateMediaControls(){
  const width=document.querySelector('#mediaWidthSlider'),gap=document.querySelector('#mediaGapSlider');
  if(!selectedMediaFigure){if(width)width.disabled=true;if(gap)gap.disabled=true;return;}
  if(width){width.disabled=false;width.value=String(Math.round(parseFloat(selectedMediaFigure.style.width)||55));}
  const g=Math.round(parseFloat(selectedMediaFigure.dataset.gap||18));if(gap){gap.disabled=false;gap.value=String(g);}
  const wo=document.querySelector('#mediaWidthOutput');if(wo)wo.textContent=`${width?.value||55}%`;
  const go=document.querySelector('#mediaGapOutput');if(go)go.textContent=`${g}px`;
}

function attachMediaInteractions(){
  selectedMediaFigure=null;
  document.querySelectorAll('.rich-editor .embedded-media').forEach(figure=>{
    figure.setAttribute('contenteditable','false');
    figure.setAttribute('draggable','false');
    const img=figure.querySelector('img');
    if(img){
      img.setAttribute('draggable','false');
      if(!img.dataset.dragBound){img.dataset.dragBound='1';img.addEventListener('pointerdown',startMediaDrag);}
    }
    if(!figure.querySelector('.media-drag-handle')){
      const handle=document.createElement('button');
      handle.type='button';
      handle.className='media-drag-handle';
      handle.textContent='⠿ Переместить';
      handle.title='Перетащите изображение по странице';
      handle.setAttribute('contenteditable','false');
      figure.appendChild(handle);
      handle.addEventListener('pointerdown',startMediaDrag);
    }
    if(!figure.querySelector('.media-resize-handle')){
      const resize=document.createElement('span');resize.className='media-resize-handle';resize.title='Тяните, чтобы изменить размер';resize.setAttribute('contenteditable','false');figure.appendChild(resize);resize.addEventListener('pointerdown',startMediaResize);
    }
  });
}

function startMediaResize(e){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();
  const handle=e.currentTarget,figure=handle.closest('.embedded-media'),editor=figure?.closest('.rich-editor');if(!figure||!editor)return;
  selectMediaFigure(figure);const rect=editor.getBoundingClientRect();
  try{handle.setPointerCapture(e.pointerId);}catch{}
  const move=ev=>{const fr=figure.getBoundingClientRect();const left=fr.left-rect.left;const px=Math.max(120,Math.min(rect.width-left-8,ev.clientX-fr.left));const pct=Math.max(20,Math.min(100,px/rect.width*100));figure.style.width=`${pct}%`;figure.style.maxWidth=`${pct}%`;updateMediaControls();};
  const up=ev=>{try{handle.releasePointerCapture(ev.pointerId);}catch{}handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);syncStudioEditor();save();};
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
}

function startMediaDrag(e){
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  const handle=e.currentTarget;
  const figure=handle.closest('.embedded-media');
  const editor=figure?.closest('.rich-editor');
  if(!figure||!editor)return;
  selectMediaFigure(figure);
  figure.classList.add('dragging');
  document.body.classList.add('media-is-dragging');
  try{handle.setPointerCapture(e.pointerId);}catch{}

  const move=ev=>{
    ev.preventDefault();
    const rect=editor.getBoundingClientRect();
    const relX=(ev.clientX-rect.left)/Math.max(1,rect.width);
    figure.classList.remove('wrap-left','wrap-right','wrap-wide','wrap-block');
    if(relX<.38) figure.classList.add('wrap-left');
    else if(relX>.62) figure.classList.add('wrap-right');
    else figure.classList.add('wrap-block');

    const siblings=[...editor.children].filter(n=>n!==figure && !n.classList?.contains('media-drag-handle'));
    if(!siblings.length){editor.appendChild(figure);return;}
    let target=null;
    for(const node of siblings){
      const r=node.getBoundingClientRect();
      if(ev.clientY < r.top+r.height/2){target=node;break;}
    }
    if(target) editor.insertBefore(figure,target); else editor.appendChild(figure);
  };
  const up=ev=>{
    figure.classList.remove('dragging');
    document.body.classList.remove('media-is-dragging');
    try{handle.releasePointerCapture(ev.pointerId);}catch{}
    handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);
    syncStudioEditor();save();rememberEditorSelection();
  };
  handle.addEventListener('pointermove',move);
  handle.addEventListener('pointerup',up);
  handle.addEventListener('pointercancel',up);
}

function setMediaSize(percent,live=false){
  if(!selectedMediaFigure){if(!live)notify('Сначала выберите картинку на странице');return;}
  const value=Math.max(20,Math.min(100,Number(percent)||55));
  selectedMediaFigure.style.width=value+'%';selectedMediaFigure.style.maxWidth=value+'%';
  const out=document.querySelector('#mediaWidthOutput');if(out)out.textContent=`${Math.round(value)}%`;
  if(!live){syncStudioEditor();save();}else scheduleStudioAutosave();
}
function setMediaGap(px,live=false){
  if(!selectedMediaFigure){if(!live)notify('Сначала выберите картинку');return;}
  const value=Math.max(0,Math.min(48,Number(px)||0));selectedMediaFigure.dataset.gap=String(value);selectedMediaFigure.style.setProperty('--media-gap',`${value}px`);const out=document.querySelector('#mediaGapOutput');if(out)out.textContent=`${value}px`;if(live)scheduleStudioAutosave();else{syncStudioEditor();save();}
}
function toggleMediaCaption(){
  if(!selectedMediaFigure){notify('Сначала выберите картинку');return;}
  let cap=selectedMediaFigure.querySelector('figcaption');if(cap){cap.remove();}else{cap=document.createElement('figcaption');cap.textContent=selectedMediaFigure.querySelector('img')?.alt||'Иллюстрация';selectedMediaFigure.appendChild(cap);}syncStudioEditor();save();
}
function resetMediaPosition(){
  if(!selectedMediaFigure){notify('Сначала выберите картинку');return;}
  selectedMediaFigure.classList.remove('wrap-left','wrap-right','wrap-wide');selectedMediaFigure.classList.add('wrap-block');selectedMediaFigure.style.width='55%';selectedMediaFigure.style.maxWidth='55%';setMediaGap(18,true);updateMediaControls();syncStudioEditor();save();
}

function makeCanvasPage(type='content',title='Без названия',author=''){
  const id=Date.now()+Math.random().toString(36).slice(2,6);
  if(type==='cover')return {id:`cover-${id}`,type:'cover',title,author,subtitle:'',canvas:{background:{color:'#101d2d',image:'',fit:'cover',position:'center'},textColor:'#ffffff',objects:[
    {id:`cover-title-${id}`,type:'text',role:'title',x:72,y:150,w:616,h:210,z:3,rotation:0,html:`<div>${title}</div>`,flow:false,locked:false,style:{fontFamily:'Georgia',fontSize:54,lineHeight:1.05,color:'#ffffff',align:'center',background:'transparent',padding:8}},
    {id:`cover-author-${id}`,type:'text',role:'author',x:150,y:830,w:460,h:90,z:3,rotation:0,html:`<div>${author}</div>`,flow:false,locked:false,style:{fontFamily:'Georgia',fontSize:20,lineHeight:1.25,color:'#ffffff',align:'center',background:'transparent',padding:6}}
  ]}};
  if(type==='title')return {id:`title-${id}`,type:'title',title,author,subtitle:'',year:String(new Date().getFullYear()),canvas:{background:{color:'#f7f1e5',image:'',fit:'cover',position:'center'},textColor:'#191715',objects:[
    {id:`title-main-${id}`,type:'text',role:'title',x:90,y:170,w:580,h:180,z:2,rotation:0,html:`<div>${title}</div>`,flow:false,locked:false,style:{fontFamily:'Georgia',fontSize:42,lineHeight:1.08,color:'#191715',align:'center',background:'transparent',padding:8}},
    {id:`title-author-${id}`,type:'text',role:'author',x:150,y:630,w:460,h:90,z:2,rotation:0,html:`<div>${author}</div>`,flow:false,locked:false,style:{fontFamily:'Georgia',fontSize:21,lineHeight:1.3,color:'#191715',align:'center',background:'transparent',padding:6}},
    {id:`title-year-${id}`,type:'text',role:'year',x:260,y:920,w:240,h:70,z:2,rotation:0,html:`<div>${new Date().getFullYear()}</div>`,flow:false,locked:false,style:{fontFamily:'Georgia',fontSize:16,lineHeight:1.2,color:'#514a43',align:'center',background:'transparent',padding:4}}
  ]}};
  return {id:`page-${id}`,type:'content',label:'Страница',html:'<p><br></p>',canvas:{background:{color:'#f7f1e5',image:'',fit:'cover',position:'center'},textColor:'#191715',objects:[{id:`flow-${id}`,type:'text',role:'body',x:72,y:72,w:616,h:936,z:1,rotation:0,html:'<p><br></p>',flow:true,locked:false,style:{fontFamily:'Georgia',fontSize:18,lineHeight:1.55,color:null,align:'left',background:'transparent',padding:6}}]}};
}
function currentCanvasState(){
  const form=document.querySelector('#workEditor'); if(!form)return null;
  const w=state.works.find(x=>x.id===form.dataset.id); if(!w||w.editorMode!=='book')return null;
  const idx=Math.max(0,Math.min((w.bookPages||[]).length-1,state.ui.bookPageIndex||0));
  const page=w.bookPages?.[idx]; if(!page)return null;
  page.canvas=page.canvas||{background:{color:page.type==='cover'?'#101d2d':'#f7f1e5',image:page.image||'',fit:'cover',position:'center'},textColor:page.type==='cover'?'#ffffff':'#191715',objects:[]};
  page.canvas.background=page.canvas.background||{color:'#f7f1e5',image:'',fit:'cover',position:'center'};
  page.canvas.objects=Array.isArray(page.canvas.objects)?page.canvas.objects:[];
  return {form,w,page,idx,canvas:page.canvas};
}
function canvasPercent(v,total){return `${(Number(v||0)/total*100).toFixed(4)}%`;}
function clampCanvas(v,min,max){return Math.max(min,Math.min(max,v));}
function applyCanvasObjectGeometry(obj){
  if(!obj)return;
  const x=Number(obj.dataset.x)||0,y=Number(obj.dataset.y)||0,w=Number(obj.dataset.w)||100,h=Number(obj.dataset.h)||100,r=Number(obj.dataset.rotation)||0;
  obj.style.left=canvasPercent(x,PAGE_CANVAS_W);obj.style.top=canvasPercent(y,PAGE_CANVAS_H);obj.style.width=canvasPercent(w,PAGE_CANVAS_W);obj.style.height=canvasPercent(h,PAGE_CANVAS_H);obj.style.zIndex=String(Number(obj.dataset.z)||1);obj.style.transform=`rotate(${r}deg)`;
}
function cleanCanvasTextHtml(content){
  const clone=content.cloneNode(true);clone.querySelectorAll('.canvas-wrap-proxy').forEach(x=>x.remove());return clone.innerHTML;
}
function serializeCanvasObject(obj,old={}){
  const base={...old,id:obj.dataset.objectId,type:obj.dataset.objectType||old.type||'text',x:Number(obj.dataset.x)||0,y:Number(obj.dataset.y)||0,w:Number(obj.dataset.w)||100,h:Number(obj.dataset.h)||100,z:Number(obj.dataset.z)||1,rotation:Number(obj.dataset.rotation)||0,locked:obj.dataset.locked==='1'};
  if(base.type==='image'){
    const img=obj.querySelector('img');
    return {...base,src:img?.getAttribute('src')||old.src||'',alt:img?.getAttribute('alt')||old.alt||'',fit:obj.dataset.fit||old.fit||'cover',radius:Number(obj.dataset.radius)||0,opacity:obj.dataset.opacity==null?(old.opacity??1):Number(obj.dataset.opacity),wrap:obj.dataset.wrap||old.wrap||'auto',gap:Number(obj.dataset.gap)||14};
  }
  const content=obj.querySelector('.canvas-text-content');
  return {...base,html:content?cleanCanvasTextHtml(content):(old.html||'<p><br></p>'),flow:obj.dataset.flow!=='0',role:obj.dataset.role||old.role||'',style:{...(old.style||{}),fontFamily:obj.dataset.fontFamily||old.style?.fontFamily||'Georgia',fontSize:Number(obj.dataset.fontSize)||old.style?.fontSize||18,lineHeight:Number(obj.dataset.lineHeight)||old.style?.lineHeight||1.55,color:obj.dataset.baseColor||old.style?.color||null,align:obj.dataset.align||old.style?.align||'left',background:obj.dataset.bg||old.style?.background||'transparent',padding:Number(obj.dataset.padding)||old.style?.padding||6}};
}
function syncCanvasDomToState(){
  const ctx=currentCanvasState(),canvasEl=document.querySelector('#freePageCanvas');if(!ctx||!canvasEl)return;
  const old=new Map((ctx.canvas.objects||[]).map(o=>[o.id,o]));
  ctx.canvas.objects=[...canvasEl.querySelectorAll(':scope > .canvas-object')].map(el=>serializeCanvasObject(el,old.get(el.dataset.objectId)||{}));
  ctx.canvas.background={...(ctx.canvas.background||{}),color:canvasEl.dataset.bgColor||ctx.canvas.background?.color||'#f7f1e5',image:canvasEl.dataset.bgImage||'',fit:canvasEl.dataset.bgFit||'cover',position:'center'};
  ctx.canvas.textColor=canvasEl.dataset.textColor||ctx.canvas.textColor||'#191715';
  const roleText={};for(const o of ctx.canvas.objects){if(o.type==='text'&&o.role){const d=document.createElement('div');d.innerHTML=o.html||'';roleText[o.role]=(d.innerText||'').trim();}}
  if(roleText.title){ctx.page.title=roleText.title;ctx.w.title=roleText.title;const titleInput=ctx.form.elements?.title;if(titleInput)titleInput.value=roleText.title;}
  if(roleText.subtitle!=null)ctx.page.subtitle=roleText.subtitle;
  if(roleText.author)ctx.page.author=roleText.author;
  if(roleText.year)ctx.page.year=roleText.year;
}
function selectCanvasObject(obj){
  document.querySelectorAll('#freePageCanvas > .canvas-object.is-selected').forEach(x=>x.classList.remove('is-selected'));
  selectedCanvasObject=obj||null;
  if(obj){obj.classList.add('is-selected');update(s=>s.ui.canvasSelectedObjectId=obj.dataset.objectId,{persist:false});}
  else update(s=>s.ui.canvasSelectedObjectId=null,{persist:false});
  updateCanvasInspector();
}
function updateCanvasInspector(){
  const empty=document.querySelector('#canvasObjectEmpty'),box=document.querySelector('#canvasObjectControls');
  if(!empty||!box)return;
  const obj=selectedCanvasObject&&document.body.contains(selectedCanvasObject)?selectedCanvasObject:null;
  empty.hidden=!!obj;box.hidden=!obj;if(!obj)return;
  const isImage=obj.dataset.objectType==='image';
  const kind=document.querySelector('#canvasObjectKind');if(kind)kind.textContent=isImage?'Фото / изображение':'Текстовый блок';
  const imageControls=document.querySelector('#canvasImageControls');if(imageControls)imageControls.hidden=!isImage;
  const textControls=document.querySelector('#canvasTextControls');if(textControls)textControls.hidden=isImage;
  const rot=document.querySelector('#canvasRotationSlider'),ro=document.querySelector('#canvasRotationOutput');if(rot)rot.value=String(Math.round(Number(obj.dataset.rotation)||0));if(ro)ro.textContent=`${Math.round(Number(obj.dataset.rotation)||0)}°`;
  const lock=document.querySelector('#canvasLockButton');if(lock)lock.textContent=obj.dataset.locked==='1'?'🔒 Разблокировать':'🔓 Зафиксировать';
  if(isImage){
    const op=document.querySelector('#canvasOpacitySlider'),oo=document.querySelector('#canvasOpacityOutput');const opacity=Math.round((Number(obj.dataset.opacity)||1)*100);if(op)op.value=String(opacity);if(oo)oo.textContent=`${opacity}%`;
    const rad=document.querySelector('#canvasRadiusSlider'),rout=document.querySelector('#canvasRadiusOutput');if(rad)rad.value=String(Number(obj.dataset.radius)||0);if(rout)rout.textContent=`${Number(obj.dataset.radius)||0}px`;
    const fit=document.querySelector('#canvasImageFit');if(fit)fit.value=obj.dataset.fit||'cover';
    const wrap=document.querySelector('#canvasImageWrap');if(wrap)wrap.value=obj.dataset.wrap||'auto';
    const gap=document.querySelector('#canvasWrapGapSlider'),go=document.querySelector('#canvasWrapGapOutput');if(gap)gap.value=String(Number(obj.dataset.gap)||14);if(go)go.textContent=`${Number(obj.dataset.gap)||14}px`;
  }else{
    const bg=document.querySelector('#canvasTextBgColor'),mode=document.querySelector('#canvasTextBgMode'),flow=document.querySelector('#canvasTextFlow');
    const current=obj.dataset.bg||'transparent';if(bg)bg.value=current==='transparent'?'#fff1a8':current;if(mode)mode.value=current==='transparent'?'transparent':'color';if(flow)flow.value=obj.dataset.flow==='0'?'0':'1';
  }
}
function canvasPointerToUnits(canvas,clientX,clientY){
  const r=canvas.getBoundingClientRect();return {x:(clientX-r.left)/Math.max(1,r.width)*PAGE_CANVAS_W,y:(clientY-r.top)/Math.max(1,r.height)*PAGE_CANVAS_H};
}
function showCanvasGuides(canvas,obj){
  const x=Number(obj.dataset.x)||0,y=Number(obj.dataset.y)||0,w=Number(obj.dataset.w)||0,h=Number(obj.dataset.h)||0;
  const vx=Math.abs(x+w/2-PAGE_CANVAS_W/2)<7,hy=Math.abs(y+h/2-PAGE_CANVAS_H/2)<7;
  canvas.classList.toggle('show-guide-v',vx);canvas.classList.toggle('show-guide-h',hy);return {vx,hy};
}
function clearCanvasGuides(canvas){canvas?.classList.remove('show-guide-v','show-guide-h');}
function finishCanvasObjectGesture(obj,canvas){
  obj?.classList.remove('is-dragging','is-resizing','is-rotating');clearCanvasGuides(canvas);syncCanvasDomToState();save();attachCanvasWrapProxies();updateCanvasInspector();
}
function startCanvasDrag(e,obj){
  if(!obj||obj.dataset.locked==='1'||e.button!==0)return;e.preventDefault();e.stopPropagation();
  const canvas=obj.closest('#freePageCanvas');if(!canvas)return;selectCanvasObject(obj);obj.classList.add('is-dragging');
  const start=canvasPointerToUnits(canvas,e.clientX,e.clientY),ox=Number(obj.dataset.x)||0,oy=Number(obj.dataset.y)||0,w=Number(obj.dataset.w)||100,h=Number(obj.dataset.h)||100;
  const target=e.currentTarget;try{target.setPointerCapture(e.pointerId);}catch{}
  const move=ev=>{const pt=canvasPointerToUnits(canvas,ev.clientX,ev.clientY);let x=clampCanvas(ox+pt.x-start.x,0,PAGE_CANVAS_W-w),y=clampCanvas(oy+pt.y-start.y,0,PAGE_CANVAS_H-h);if(state.ui.studioGrid&&!ev.altKey){x=Math.round(x/10)*10;y=Math.round(y/10)*10;}obj.dataset.x=String(x);obj.dataset.y=String(y);const guides=showCanvasGuides(canvas,obj);if(guides.v&&!ev.altKey)obj.dataset.x=String(PAGE_CANVAS_W/2-w/2);if(guides.hy&&!ev.altKey)obj.dataset.y=String(PAGE_CANVAS_H/2-h/2);applyCanvasObjectGeometry(obj);attachCanvasWrapProxies();};
  const up=ev=>{try{target.releasePointerCapture(ev.pointerId);}catch{}target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',up);finishCanvasObjectGesture(obj,canvas);};
  target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);
}
function startCanvasResize(e,obj,dir){
  if(!obj||obj.dataset.locked==='1'||e.button!==0)return;e.preventDefault();e.stopPropagation();const canvas=obj.closest('#freePageCanvas');if(!canvas)return;selectCanvasObject(obj);obj.classList.add('is-resizing');
  const start=canvasPointerToUnits(canvas,e.clientX,e.clientY),ox=Number(obj.dataset.x)||0,oy=Number(obj.dataset.y)||0,ow=Number(obj.dataset.w)||100,oh=Number(obj.dataset.h)||100,ratio=ow/Math.max(1,oh),isImage=obj.dataset.objectType==='image';const target=e.currentTarget;try{target.setPointerCapture(e.pointerId);}catch{}
  const move=ev=>{const pt=canvasPointerToUnits(canvas,ev.clientX,ev.clientY);let dx=pt.x-start.x,dy=pt.y-start.y,x=ox,y=oy,w=ow,h=oh;const minW=isImage?60:90,minH=isImage?50:48;if(dir.includes('e'))w=Math.max(minW,ow+dx);if(dir.includes('s'))h=Math.max(minH,oh+dy);if(dir.includes('w')){w=Math.max(minW,ow-dx);x=ox+(ow-w);}if(dir.includes('n')){h=Math.max(minH,oh-dy);y=oy+(oh-h);}if(isImage&&!ev.shiftKey&&dir.length===2){if(Math.abs(dx)>Math.abs(dy)){h=w/ratio;if(dir.includes('n'))y=oy+oh-h;}else{w=h*ratio;if(dir.includes('w'))x=ox+ow-w;}}w=Math.min(w,PAGE_CANVAS_W-x);h=Math.min(h,PAGE_CANVAS_H-y);x=clampCanvas(x,0,PAGE_CANVAS_W-w);y=clampCanvas(y,0,PAGE_CANVAS_H-h);obj.dataset.x=String(x);obj.dataset.y=String(y);obj.dataset.w=String(w);obj.dataset.h=String(h);applyCanvasObjectGeometry(obj);attachCanvasWrapProxies();};
  const up=ev=>{try{target.releasePointerCapture(ev.pointerId);}catch{}target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',up);finishCanvasObjectGesture(obj,canvas);};target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);
}
function startCanvasRotate(e,obj){
  if(!obj||obj.dataset.locked==='1'||e.button!==0)return;e.preventDefault();e.stopPropagation();const canvas=obj.closest('#freePageCanvas');if(!canvas)return;selectCanvasObject(obj);obj.classList.add('is-rotating');const or=obj.getBoundingClientRect(),cx=or.left+or.width/2,cy=or.top+or.height/2;const startAngle=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI,base=Number(obj.dataset.rotation)||0,target=e.currentTarget;try{target.setPointerCapture(e.pointerId);}catch{}
  const move=ev=>{let angle=base+(Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI-startAngle);if(!ev.altKey)angle=Math.round(angle/5)*5;obj.dataset.rotation=String(Math.round(angle));applyCanvasObjectGeometry(obj);updateCanvasInspector();};
  const up=ev=>{try{target.releasePointerCapture(ev.pointerId);}catch{}target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',up);finishCanvasObjectGesture(obj,canvas);};target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);
}
function addCanvasChrome(obj){
  if(obj.querySelector(':scope > .canvas-object-chrome'))return;
  const chrome=document.createElement('div');chrome.className='canvas-object-chrome';chrome.setAttribute('contenteditable','false');
  const move=document.createElement('button');move.type='button';move.className='canvas-move-handle';move.title='Перетащить';move.textContent='⠿';move.addEventListener('pointerdown',e=>startCanvasDrag(e,obj));chrome.appendChild(move);
  for(const dir of ['nw','n','ne','e','se','s','sw','w']){const h=document.createElement('span');h.className=`canvas-resize-handle handle-${dir}`;h.dataset.dir=dir;h.addEventListener('pointerdown',e=>startCanvasResize(e,obj,dir));chrome.appendChild(h);}
  const rot=document.createElement('span');rot.className='canvas-rotate-handle';rot.title='Повернуть';rot.addEventListener('pointerdown',e=>startCanvasRotate(e,obj));chrome.appendChild(rot);obj.appendChild(chrome);
}
function autoGrowCanvasText(content){
  const obj=content.closest('.canvas-text-object'),canvas=obj?.closest('#freePageCanvas');if(!obj||!canvas)return;const overflow=content.scrollHeight-content.clientHeight;if(overflow<=2)return;const cr=canvas.getBoundingClientRect();const extra=overflow/Math.max(1,cr.height)*PAGE_CANVAS_H+8;const y=Number(obj.dataset.y)||0;obj.dataset.h=String(Math.min(PAGE_CANVAS_H-y,Number(obj.dataset.h||120)+extra));applyCanvasObjectGeometry(obj);
}
function attachCanvasInteractions(){
  const canvas=document.querySelector('#freePageCanvas');if(!canvas){selectedCanvasObject=null;return;}
  canvas.addEventListener('pointerdown',e=>{if(e.target===canvas||e.target.classList.contains('page-background-image'))selectCanvasObject(null);});
  canvas.addEventListener('dblclick',e=>{if(e.target.closest('.canvas-object'))return;const pt=canvasPointerToUnits(canvas,e.clientX,e.clientY);addCanvasTextObject('text',pt.x,pt.y);});
  canvas.addEventListener('dragover',e=>{if([...e.dataTransfer?.items||[]].some(i=>i.type?.startsWith('image/'))){e.preventDefault();canvas.classList.add('is-file-over');}});
  canvas.addEventListener('dragleave',e=>{if(!canvas.contains(e.relatedTarget))canvas.classList.remove('is-file-over');});
  canvas.addEventListener('drop',handleCanvasImageDrop);
  canvas.addEventListener('paste',handleCanvasImagePaste);
  canvas.querySelectorAll(':scope > .canvas-object').forEach(obj=>{
    addCanvasChrome(obj);obj.addEventListener('pointerdown',e=>{selectCanvasObject(obj);if(obj.dataset.objectType==='image'&&!e.target.closest('.canvas-object-chrome')&&obj.dataset.locked!=='1')startCanvasDrag(e,obj);},true);
    const content=obj.querySelector('.canvas-text-content');if(content){content.addEventListener('focus',()=>selectCanvasObject(obj));content.addEventListener('input',()=>{autoGrowCanvasText(content);scheduleStudioAutosave();attachCanvasWrapProxies();});}
  });
  const wanted=state.ui.canvasSelectedObjectId;const target=wanted?canvas.querySelector(`[data-object-id="${CSS.escape(wanted)}"]`):null;if(target)selectCanvasObject(target);
  if(!document.body.dataset.canvasKeysBound){document.body.dataset.canvasKeysBound='1';document.addEventListener('keydown',e=>{const obj=selectedCanvasObject;if(!obj||!document.body.contains(obj))return;const inText=e.target.closest?.('.canvas-text-content,input,textarea,select');if(inText)return;if((e.key==='Delete'||e.key==='Backspace')){e.preventDefault();deleteSelectedCanvasObject();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelectedCanvasObject();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&obj.dataset.locked!=='1'){e.preventDefault();const step=e.shiftKey?10:1;let x=Number(obj.dataset.x)||0,y=Number(obj.dataset.y)||0,w=Number(obj.dataset.w)||100,h=Number(obj.dataset.h)||100;if(e.key==='ArrowLeft')x-=step;if(e.key==='ArrowRight')x+=step;if(e.key==='ArrowUp')y-=step;if(e.key==='ArrowDown')y+=step;obj.dataset.x=String(clampCanvas(x,0,PAGE_CANVAS_W-w));obj.dataset.y=String(clampCanvas(y,0,PAGE_CANVAS_H-h));applyCanvasObjectGeometry(obj);syncCanvasDomToState();scheduleStudioAutosave();attachCanvasWrapProxies();}if(e.key==='Escape')selectCanvasObject(null);});}
}
async function handleCanvasImageDrop(e){
  const canvas=e.currentTarget;canvas.classList.remove('is-file-over');const file=[...e.dataTransfer?.files||[]].find(f=>f.type?.startsWith('image/'));if(!file)return;e.preventDefault();
  if(file.size>12_000_000){alert('Изображение слишком большое. Максимум 12 МБ.');return;}
  try{const pt=canvasPointerToUnits(canvas,e.clientX,e.clientY),src=await optimizeImageForStudio(file);const ctx=currentCanvasState();if(ctx){ctx.w.mediaLibrary??=[];ctx.w.mediaLibrary.push({src,name:file.name});}addCanvasImageObject(src,file.name,pt.x-140,pt.y-110);}catch(err){alert(`Не удалось обработать изображение: ${err.message}`);}
}
async function handleCanvasImagePaste(e){
  const file=[...e.clipboardData?.files||[]].find(f=>f.type?.startsWith('image/'));if(!file)return;e.preventDefault();
  try{const src=await optimizeImageForStudio(file),ctx=currentCanvasState();if(ctx){ctx.w.mediaLibrary??=[];ctx.w.mediaLibrary.push({src,name:file.name||'Вставленное изображение'});}addCanvasImageObject(src,file.name||'Вставленное изображение',240,250);}catch(err){alert(`Не удалось вставить изображение: ${err.message}`);}
}
function addCanvasTextObject(kind='text',x=100,y=120){
  const ctx=currentCanvasState();if(!ctx)return;syncCanvasDomToState();const id=`text-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,note=kind==='note';const z=Math.max(0,...ctx.canvas.objects.map(o=>Number(o.z)||0))+1;ctx.canvas.objects.push({id,type:'text',x:clampCanvas(x,0,PAGE_CANVAS_W-260),y:clampCanvas(y,0,PAGE_CANVAS_H-120),w:note?300:360,h:note?180:150,z,rotation:0,html:note?'<p>Новая заметка</p>':'<p>Введите текст…</p>',flow:!note,locked:false,style:{fontFamily:'Georgia',fontSize:note?20:18,lineHeight:1.45,color:note?'#34230f':null,align:'left',background:note?'#fff1a8':'transparent',padding:note?18:8}});update(s=>s.ui.canvasSelectedObjectId=id,{persist:false});save();render();requestAnimationFrame(()=>{const el=document.querySelector(`[data-object-id="${CSS.escape(id)}"] .canvas-text-content`);if(el){el.focus();const sel=getSelection();sel?.selectAllChildren(el);}});
}
function addCanvasImageObject(src,name,x=220,y=220){
  const ctx=currentCanvasState();if(!ctx)return;syncCanvasDomToState();const id=`image-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,z=Math.max(0,...ctx.canvas.objects.map(o=>Number(o.z)||0))+1;ctx.canvas.objects.push({id,type:'image',x:clampCanvas(x,0,PAGE_CANVAS_W-280),y:clampCanvas(y,0,PAGE_CANVAS_H-220),w:280,h:220,z,rotation:0,src:String(src||''),alt:String(name||'Фото'),fit:'cover',radius:0,opacity:1,wrap:'auto',gap:14,locked:false});update(s=>s.ui.canvasSelectedObjectId=id,{persist:false});save();render();
}
function deleteSelectedCanvasObject(){if(!selectedCanvasObject)return;const id=selectedCanvasObject.dataset.objectId,ctx=currentCanvasState();if(!ctx)return;syncCanvasDomToState();ctx.canvas.objects=ctx.canvas.objects.filter(o=>o.id!==id);update(s=>s.ui.canvasSelectedObjectId=null,{persist:false});selectedCanvasObject=null;save();render();}
function duplicateSelectedCanvasObject(){if(!selectedCanvasObject)return;const id=selectedCanvasObject.dataset.objectId,ctx=currentCanvasState();if(!ctx)return;syncCanvasDomToState();const source=ctx.canvas.objects.find(o=>o.id===id);if(!source)return;const clone=structuredClone(source);clone.id=`${source.type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;clone.x=clampCanvas((source.x||0)+28,0,PAGE_CANVAS_W-(source.w||100));clone.y=clampCanvas((source.y||0)+28,0,PAGE_CANVAS_H-(source.h||100));clone.z=Math.max(0,...ctx.canvas.objects.map(o=>Number(o.z)||0))+1;ctx.canvas.objects.push(clone);update(s=>s.ui.canvasSelectedObjectId=clone.id,{persist:false});save();render();}
function setCanvasLayer(mode){if(!selectedCanvasObject)return;const canvas=selectedCanvasObject.closest('#freePageCanvas');if(!canvas)return;const objects=[...canvas.querySelectorAll(':scope > .canvas-object')].sort((a,b)=>(Number(a.dataset.z)||0)-(Number(b.dataset.z)||0));let i=objects.indexOf(selectedCanvasObject);if(i<0)return;let j=i;if(mode==='front')j=objects.length-1;else if(mode==='back')j=0;else if(mode==='forward')j=Math.min(objects.length-1,i+1);else if(mode==='backward')j=Math.max(0,i-1);objects.splice(i,1);objects.splice(j,0,selectedCanvasObject);objects.forEach((o,k)=>{o.dataset.z=String(k+1);o.style.zIndex=String(k+1);});syncCanvasDomToState();save();}
function toggleCanvasLock(){if(!selectedCanvasObject)return;selectedCanvasObject.dataset.locked=selectedCanvasObject.dataset.locked==='1'?'0':'1';selectedCanvasObject.classList.toggle('is-locked',selectedCanvasObject.dataset.locked==='1');syncCanvasDomToState();save();updateCanvasInspector();}
function setCanvasObjectProperty(prop,value,live=false){
  const obj=selectedCanvasObject;if(!obj)return;const img=obj.querySelector('img');
  if(prop==='rotation'){obj.dataset.rotation=String(Number(value)||0);applyCanvasObjectGeometry(obj);const o=document.querySelector('#canvasRotationOutput');if(o)o.textContent=`${Math.round(Number(value)||0)}°`;}
  if(obj.dataset.objectType==='image'){
    if(prop==='opacity'){obj.dataset.opacity=String(value);if(img)img.style.opacity=String(value);const o=document.querySelector('#canvasOpacityOutput');if(o)o.textContent=`${Math.round(Number(value)*100)}%`;}
    if(prop==='radius'){obj.dataset.radius=String(Number(value)||0);if(img)img.style.borderRadius=`${Number(value)||0}px`;const o=document.querySelector('#canvasRadiusOutput');if(o)o.textContent=`${Number(value)||0}px`;}
    if(prop==='fit'){obj.dataset.fit=String(value);if(img)img.style.objectFit=String(value);}
    if(prop==='wrap'){obj.dataset.wrap=String(value);attachCanvasWrapProxies();}
    if(prop==='gap'){obj.dataset.gap=String(Number(value)||0);const o=document.querySelector('#canvasWrapGapOutput');if(o)o.textContent=`${Number(value)||0}px`;attachCanvasWrapProxies();}
  }else{
    const content=obj.querySelector('.canvas-text-content');
    if(prop==='textBg'){obj.dataset.bg=String(value);if(content)content.style.background=String(value);const mode=document.querySelector('#canvasTextBgMode');if(mode)mode.value='color';}
    if(prop==='textBgMode'){if(String(value)==='transparent'){obj.dataset.bg='transparent';if(content)content.style.background='transparent';}else{const c=document.querySelector('#canvasTextBgColor')?.value||'#fff1a8';obj.dataset.bg=c;if(content)content.style.background=c;}}
    if(prop==='flow'){obj.dataset.flow=String(value)==='0'?'0':'1';attachCanvasWrapProxies();}
  }
  syncCanvasDomToState();if(live)scheduleStudioAutosave();else save();
}
function applyCanvasBackgroundDom(){
  const ctx=currentCanvasState(),canvas=document.querySelector('#freePageCanvas');if(!ctx||!canvas)return;const bg=ctx.canvas.background||{};canvas.dataset.bgColor=bg.color||'#f7f1e5';canvas.dataset.bgImage=bg.image||'';canvas.dataset.bgFit=bg.fit||'cover';canvas.dataset.textColor=ctx.canvas.textColor||'#191715';canvas.style.backgroundColor=bg.color||'#f7f1e5';let im=canvas.querySelector(':scope > .page-background-image');if(bg.image){if(!im){im=document.createElement('img');im.className='page-background-image';im.alt='';im.draggable=false;canvas.prepend(im);}im.src=bg.image;im.style.objectFit=bg.fit||'cover';}else im?.remove();canvas.querySelectorAll('.canvas-text-object').forEach(o=>{const content=o.querySelector('.canvas-text-content');if(content&&!o.dataset.baseColor)content.style.color=ctx.canvas.textColor||'#191715';});
}
function setPageBackgroundColor(color){const ctx=currentCanvasState();if(!ctx)return;ctx.canvas.background.color=String(color);applyCanvasBackgroundDom();scheduleStudioAutosave();}
function setPageTextColor(color){const ctx=currentCanvasState();if(!ctx)return;ctx.canvas.textColor=String(color);applyCanvasBackgroundDom();scheduleStudioAutosave();}
function setPageBackgroundFit(fit){const ctx=currentCanvasState();if(!ctx)return;ctx.canvas.background.fit=fit==='contain'?'contain':'cover';applyCanvasBackgroundDom();scheduleStudioAutosave();}
function setPageBackgroundImage(src){const ctx=currentCanvasState();if(!ctx)return;ctx.canvas.background.image=String(src||'');applyCanvasBackgroundDom();save();}
function clearPageBackgroundImage(){setPageBackgroundImage('');}
function mergeBands(bands){const sorted=bands.filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start),out=[];for(const b of sorted){const last=out.at(-1);if(last&&b.start<=last.end)last.end=Math.max(last.end,b.end);else out.push({...b});}return out;}
function exclusionGradient(bands,height){const m=mergeBands(bands);if(!m.length)return 'none';const stops=['transparent 0%'];for(const b of m){const a=clampCanvas(b.start/height*100,0,100),z=clampCanvas(b.end/height*100,0,100);stops.push(`transparent ${a.toFixed(2)}%`,`rgba(0,0,0,1) ${a.toFixed(2)}%`,`rgba(0,0,0,1) ${z.toFixed(2)}%`,`transparent ${z.toFixed(2)}%`);}stops.push('transparent 100%');return `linear-gradient(to bottom,${stops.join(',')})`;}
function attachCanvasWrapProxies(){
  document.querySelectorAll('.page-composition').forEach(canvas=>{
    canvas.querySelectorAll('.canvas-wrap-proxy').forEach(x=>x.remove());
    const images=[...canvas.querySelectorAll(':scope > .canvas-image-object[data-wrap="auto"]')];if(!images.length)return;
    for(const textObj of canvas.querySelectorAll(':scope > .canvas-text-object[data-flow="1"]')){
      const content=textObj.querySelector('.canvas-text-content');if(!content||Math.abs(Number(textObj.dataset.rotation)||0)>1)continue;const tr=textObj.getBoundingClientRect();if(tr.width<20||tr.height<20)continue;const left=[],right=[];
      for(const image of images){const ir=image.getBoundingClientRect();const ix=Math.max(ir.left,tr.left),iy=Math.max(ir.top,tr.top),rx=Math.min(ir.right,tr.right),by=Math.min(ir.bottom,tr.bottom);if(rx<=ix||by<=iy)continue;const gap=(Number(image.dataset.gap)||14)*(tr.width/PAGE_CANVAS_W);const center=(ir.left+ir.right)/2;const side=center<tr.left+tr.width/2?'left':'right';const band={start:Math.max(0,iy-tr.top-gap),end:Math.min(tr.height,by-tr.top+gap),width:side==='left'?Math.min(tr.width,rx-tr.left+gap):Math.min(tr.width,tr.right-ix+gap)};(side==='left'?left:right).push(band);}
      for(const [side,bands] of [['left',left],['right',right]]){if(!bands.length)continue;const proxy=document.createElement('span');proxy.className=`canvas-wrap-proxy proxy-${side}`;proxy.contentEditable='false';const width=Math.max(...bands.map(b=>b.width));proxy.style.cssText=`float:${side};width:${Math.max(1,width)}px;height:${Math.max(1,tr.height)}px;shape-outside:${exclusionGradient(bands,tr.height)};shape-image-threshold:.1;pointer-events:none;user-select:none;opacity:0;`;content.prepend(proxy);}
    }
  });
}

function attachReadingProgress(text){
  const workId=text.dataset.work; if(!workId)return;
  const saved=Math.max(0,Math.min(100,Number(state.readingProgress?.[workId]||0)));
  requestAnimationFrame(()=>{
    const max=Math.max(0,text.scrollHeight-text.clientHeight);
    if(max>0&&saved>0&&saved<100) text.scrollTop=max*(saved/100);
  });
  let timer=null;
  text.addEventListener('scroll',()=>{
    const max=Math.max(1,text.scrollHeight-text.clientHeight);
    const pct=Math.max(0,Math.min(99,Math.round((text.scrollTop/max)*100)));
    const label=document.querySelector('#readerProgressValue'); if(label)label.textContent=`${pct}%`;
    clearTimeout(timer); timer=setTimeout(()=>{update(s=>{s.readingProgress[workId]=pct;if(!s.library.completed.includes(workId)&&!s.library.reading.includes(workId))s.library.reading.push(workId);});const w=state.works.find(x=>x.id===workId);if(w?.cloud)saveCloudReadingProgress(w,{progress:pct,status:'reading'}).catch(()=>{});},320);
  });
}

function activeRichEditor(){
  const node=window.getSelection()?.anchorNode;
  const el=node?.nodeType===1?node:node?.parentElement;
  return el?.closest?.('.rich-editor,.canvas-text-content')||selectedCanvasObject?.querySelector?.('.canvas-text-content')||document.querySelector('.rich-editor,.canvas-text-content');
}
function rememberEditorSelection(){
  const sel=window.getSelection(); if(!sel||!sel.rangeCount)return;
  const range=sel.getRangeAt(0); const root=(range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement)?.closest?.('.rich-editor,.canvas-text-content');
  if(root) savedEditorRange=range.cloneRange();
}
function restoreEditorSelection(){
  const ed=activeRichEditor();
  if(!savedEditorRange)return ed;
  try{const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedEditorRange);}catch{}
  return activeRichEditor()||ed;
}
function updateEditorWordCount(){
  const label=document.querySelector('#editorWordCount'); if(!label)return;
  const text=[...document.querySelectorAll('.rich-editor,.canvas-text-content')].map(x=>x.innerText||'').join(' ').trim();
  const count=text?text.split(/\s+/).filter(Boolean).length:0; label.textContent=`${count} слов`;
}
function execEditorCommand(cmd,value=null){
  const ed=restoreEditorSelection(); if(!ed){notify('Сначала поставьте курсор в текст');return;}
  ed.focus();
  try{document.execCommand('styleWithCSS',false,true);document.execCommand(cmd,false,value);}catch{}
  rememberEditorSelection();updateEditorWordCount();scheduleStudioAutosave();syncEditorToolbar();
}
function selectedBlocks(ed){
  const range=savedEditorRange; if(!ed||!range)return [];
  const blocks=[...ed.querySelectorAll('p,h1,h2,h3,h4,blockquote,li,div')].filter(el=>{try{return range.intersectsNode(el);}catch{return false;}});
  if(blocks.length)return blocks;
  const node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
  const block=node?.closest?.('p,h1,h2,h3,h4,blockquote,li,div');return block&&ed.contains(block)?[block]:[ed];
}
function applyFontSize(px){
  const ed=restoreEditorSelection();if(!ed)return;
  ed.focus();try{document.execCommand('styleWithCSS',false,false);document.execCommand('fontSize',false,'7');}catch{}
  ed.querySelectorAll('font[size="7"]').forEach(font=>{font.removeAttribute('size');font.style.fontSize=`${px}px`;});
  rememberEditorSelection();scheduleStudioAutosave();
}
function applyEditorTool(tool,value){
  const ed=restoreEditorSelection();if(!ed){notify('Выделите текст или поставьте курсор');return;}
  ed.focus();
  if(tool==='fontFamily')execEditorCommand('fontName',value);
  else if(tool==='fontSize')applyFontSize(Number(value)||16);
  else if(tool==='color')execEditorCommand('foreColor',value);
  else if(tool==='backgroundColor'){try{document.execCommand('hiliteColor',false,value);}catch{document.execCommand('backColor',false,value);}rememberEditorSelection();scheduleStudioAutosave();}
  else if(tool==='block')execEditorCommand('formatBlock',value);
  else if(tool==='lineHeight'){selectedBlocks(ed).forEach(el=>el.style.lineHeight=String(value));rememberEditorSelection();scheduleStudioAutosave();}
  syncEditorToolbar();
}
function syncEditorToolbar(){
  const ed=activeRichEditor();if(!ed)return;
  const sel=window.getSelection();const node=sel?.anchorNode;const el=node?.nodeType===1?node:node?.parentElement;if(!el||!ed.contains(el))return;
  const cs=getComputedStyle(el);
  const family=document.querySelector('[data-editor-tool="fontFamily"]');if(family){const f=cs.fontFamily.replace(/["']/g,'').split(',')[0].trim();if([...family.options].some(o=>o.value===f))family.value=f;}
  const size=document.querySelector('[data-editor-tool="fontSize"]');if(size){const n=Math.round(parseFloat(cs.fontSize));if([...size.options].some(o=>Number(o.value)===n))size.value=String(n);}
  const line=document.querySelector('[data-editor-tool="lineHeight"]');if(line){const lh=parseFloat(cs.lineHeight)/Math.max(1,parseFloat(cs.fontSize));const best=[...line.options].map(o=>Number(o.value)).sort((a,b)=>Math.abs(a-lh)-Math.abs(b-lh))[0];if(best)line.value=String(best);}
}
function syncCurrentBookPage(){
  const form=document.querySelector('#workEditor'); if(!form)return;
  const id=form.dataset.id; const w=state.works.find(x=>x.id===id); if(!w||w.editorMode!=='book')return;
  syncCanvasDomToState();
}
function syncDocumentPages(){
  const form=document.querySelector('#workEditor'); if(!form)return;
  const id=form.dataset.id; const w=state.works.find(x=>x.id===id); if(!w||w.editorMode==='book')return;
  w.documentPages=[...document.querySelectorAll('.doc-page-editor')].map((el,i)=>({id:w.documentPages?.[i]?.id||`doc-${Date.now()}-${i}`,html:cleanEditorHtml(el)}));
}
function syncStudioEditor(){ syncCurrentBookPage(); syncDocumentPages(); }
function textFromHtml(html){const d=document.createElement('div');d.innerHTML=html||'';return (d.innerText||'').trim();}
function insertMedia(src,name){
  const form=document.querySelector('#workEditor'); if(!form)return;
  const w=state.works.find(x=>x.id===form.dataset.id); if(!w)return;
  const pageType=document.querySelector('.book-stage')?.dataset.pageType;
  if(w.editorMode==='book'&&pageType==='cover'){
    syncCurrentBookPage(); update(s=>{const p=s.works.find(x=>x.id===w.id)?.bookPages?.[s.ui.bookPageIndex||0];if(p)p.image=src;});render();return;
  }
  const ed=restoreEditorSelection(); if(!ed){notify('Поставьте курсор в текст и повторите');return;}
  const figure=document.createElement('figure');figure.className='embedded-media wrap-block';figure.contentEditable='false';figure.dataset.gap='18';figure.style.cssText='width:55%;max-width:55%;--media-gap:18px';
  const img=document.createElement('img');img.src=String(src);img.alt=String(name||'Иллюстрация');img.draggable=false;figure.appendChild(img);
  const cap=document.createElement('figcaption');cap.textContent=String(name||'Иллюстрация');figure.appendChild(cap);
  const range=savedEditorRange;let block=null;
  if(range){let node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;while(node&&node.parentElement!==ed)node=node.parentElement;if(node&&node.parentElement===ed)block=node;}
  if(block)block.after(figure);else ed.appendChild(figure);
  if(!figure.nextSibling){const p=document.createElement('p');p.innerHTML='<br>';ed.appendChild(p);}
  attachMediaInteractions();selectMediaFigure(figure);updateEditorWordCount();scheduleStudioAutosave();
}
function setMediaWrap(wrap){
  if(!selectedMediaFigure){notify('Сначала нажмите на картинку в тексте');return;}
  selectedMediaFigure.classList.remove('wrap-left','wrap-right','wrap-wide','wrap-block'); selectedMediaFigure.classList.add(wrap);
  if(wrap==='wrap-wide'){selectedMediaFigure.style.width='100%';selectedMediaFigure.style.maxWidth='100%';}
  else if(wrap==='wrap-block' && parseFloat(selectedMediaFigure.style.width||'0')>=95){selectedMediaFigure.style.width='65%';selectedMediaFigure.style.maxWidth='65%';}
  updateMediaControls();syncStudioEditor();save();
}
async function handleMediaUpload(e){
  const file=e.target.files?.[0]; if(!file)return;
  syncStudioEditor();
  if(file.size>12_000_000){alert('Изображение слишком большое. Максимум 12 МБ.');e.target.value='';return;}
  const form=document.querySelector('#workEditor'); const id=form?.dataset.id; if(!id)return;
  try{
    const src=await optimizeImageForStudio(file);
    const bookMode=state.works.find(x=>x.id===id)?.editorMode==='book';
    update(s=>{const w=s.works.find(x=>x.id===id);if(w)(w.mediaLibrary??=[]).push({src,name:file.name});},{persist:true});
    if(bookMode)addCanvasImageObject(src,file.name);else render();
  }catch(err){alert(`Не удалось обработать изображение: ${err.message}`);}finally{e.target.value='';}
}
async function optimizeImageForStudio(file){
  if(file.type==='image/svg+xml')return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
  const url=URL.createObjectURL(file);try{
    const img=new Image();img.decoding='async';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Файл не является читаемым изображением'));img.src=url;});
    const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/webp',.86);
  }finally{URL.revokeObjectURL(url);}
}
function startCreateProject(type,mode){
  const id='w-'+Date.now();
  update(s=>{
    const blank={id,authorId:s.user.id,author:s.user.name,title:'Без названия',kind:type==='evaluation'?'Фрагмент':'Роман',genres:[],summary:'',cover:'/assets/home/reading-cover.png',version:'0.1',rating:0,ratingsCount:0,authorActivity:20,createdAt:new Date().toISOString(),minutes:2,publicationStatus:'draft',evaluationStatus:'closed',status:'draft',targetType:'Фрагмент',evaluationTarget:'Фрагмент',evaluationText:'',feedbackWanted:[],content:'',creationType:type,editorMode:mode,documentPages:[{id:'doc-'+Date.now(),html:'<p><br></p>'}],bookPages:[makeCanvasPage('cover','Без названия',s.user.name),makeCanvasPage('title','Без названия',s.user.name),makeCanvasPage('content','Без названия',s.user.name)],mediaLibrary:[]};
    s.works.unshift(blank);s.ui.selectedStudioWorkId=id;s.ui.createDraftType=null;s.ui.bookPageIndex=0;s.ui.bookViewMode=false;s.ui.bookSpreadIndex=0;s.ui.page='create';
  }); render();
}
function cleanIdentifier(method,value){
  const raw=String(value||'').trim();
  if(method==='phone')return raw.replace(/[\s()\-]/g,'');
  return raw.toLowerCase();
}
function cloudUserFrom(profile,authUser,fallback={}){
  return {
    id:authUser?.id||profile?.id,
    nickname:profile?.nickname||fallback.nickname||profile?.username||'Пользователь',
    name:profile?.nickname||fallback.nickname||profile?.username||'Пользователь',
    firstName:profile?.first_name||fallback.firstName||'',
    lastName:profile?.last_name||fallback.lastName||'',
    username:profile?.username||fallback.username||'',
    email:authUser?.email||fallback.email||'',
    phone:authUser?.phone||fallback.phone||'',
    role:(profile?.account_role==='author'&&profile?.author_verified)?'author':'reader',
    requestedRole:profile?.account_role||fallback.role||'reader',
    verified:!!profile?.author_verified,
    isAdmin:!!profile?.is_admin,
    xp:profile?.xp||0,
    reputation:profile?.reviewer_reputation||0,
    preferences:profile?.wanted_genres||fallback.preferences||[],
    avoid:profile?.unwanted_genres||fallback.avoid||[],
    cloud:true,
    createdAt:new Date().toISOString()
  };
}
async function waitForProfile(){
  for(let i=0;i<4;i++){
    const profile=await getMyProfile().catch(()=>null);
    if(profile)return profile;
    await new Promise(r=>setTimeout(r,250*(i+1)));
  }
  return null;
}
async function handleRegistrationOtpRequest(e){
  e.preventDefault();
  const fd=new FormData(e.currentTarget); const role=e.currentTarget.dataset.role;
  const genres=fd.getAll('genres'); const avoid=fd.getAll('avoid').filter(x=>!genres.includes(x));
  const nickname=String(fd.get('nickname')||'').trim();
  const firstName=String(fd.get('firstName')||'').trim();
  const lastName=String(fd.get('lastName')||'').trim();
  const username=String(fd.get('username')||'').trim().replace(/^@/,'');
  const identifier=cleanIdentifier(authMethod,fd.get('identifier'));
  if(authMethod==='phone'&&!/^\+\d{7,15}$/.test(identifier)){alert('Телефон укажите в международном формате, например +79991234567.');return;}
  const metadata={username,nickname,first_name:firstName,last_name:lastName,account_role:role};
  try{
    await requestOtp({method:authMethod,identifier,createUser:true,metadata});
    otpPending={mode:'register',method:authMethod,identifier,role,registration:{nickname,firstName,lastName,username,preferences:genres,avoid,email:authMethod==='email'?identifier:'',phone:authMethod==='phone'?identifier:''},metadata};
    render();
  }catch(err){alert(`Не удалось отправить код: ${err.message}`);}
}
async function handleLoginOtpRequest(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);const identifier=cleanIdentifier(authMethod,fd.get('identifier'));
  if(authMethod==='phone'&&!/^\+\d{7,15}$/.test(identifier)){alert('Телефон укажите в международном формате, например +79991234567.');return;}
  try{
    await requestOtp({method:authMethod,identifier,createUser:false});
    otpPending={mode:'login',method:authMethod,identifier};render();
  }catch(err){alert(`Не удалось отправить код: ${err.message}`);}
}
async function resendOtp(){
  if(!otpPending)return;
  try{
    await requestOtp({method:otpPending.method,identifier:otpPending.identifier,createUser:otpPending.mode==='register',metadata:otpPending.metadata||{}});
    alert('Код отправлен повторно');
  }catch(err){alert(`Не удалось повторно отправить код: ${err.message}`);}
}
async function handleOtpVerify(e){
  e.preventDefault(); if(!otpPending)return;
  const token=String(new FormData(e.currentTarget).get('token')||'').trim();
  if(!token){alert('Введите код из сообщения.');return;}
  try{
    const auth=await verifyOtp({method:otpPending.method,identifier:otpPending.identifier,token});
    if(!auth?.access_token||!auth?.user)throw new Error('Supabase не вернул активную сессию');
    const fallback=otpPending.registration||{};
    let profile=await waitForProfile();
    // Этот Supabase-проект используется и другими частями Fraktum. Если email/телефон
    // уже существовал в auth.users раньше, триггер INSERT не создаст lit_profiles повторно.
    // В таком случае завершаем именно регистрацию литературного профиля после успешного OTP.
    if(!profile && otpPending.mode==='register'){
      profile=await createMyProfile({
        username:fallback.username,
        nickname:fallback.nickname,
        firstName:fallback.firstName,
        lastName:fallback.lastName,
        role:'reader'
      });
    }
    if(!profile)throw new Error('Для этого аккаунта ещё нет профиля FRAKTUM. Нажмите «Регистрация», чтобы создать его.');
    if(otpPending.mode==='register'){
      const updated=await updateMyProfile({wanted_genres:fallback.preferences||[],unwanted_genres:fallback.avoid||[]}).catch(()=>null);
      if(updated) profile=updated;
      else Object.assign(profile,{wanted_genres:fallback.preferences||profile.wanted_genres,unwanted_genres:fallback.avoid||profile.unwanted_genres});
      if(otpPending.role==='author'){
        await requestAuthorVerification('Заявка создана при регистрации автора в Closed Beta.').catch(err=>console.warn('author verification request',err));
      }
    }
    const user=cloudUserFrom(profile,auth.user,fallback);
    update(s=>{s.user=user;s.ui.page='home';s.cloud={...(s.cloud||{}),connected:true,serverOnline:true,lastSync:new Date().toISOString(),error:null};});
    signupRole=null;loginMode=false;otpPending=null;forceAuthScreen=false;await refreshCloudLiterature();await refreshCloudFeed();await refreshCloudChats(false);await refreshNotifications(false);if(user.isAdmin)await refreshAdminData(false);startCloudPolling();render();
  }catch(err){alert(`Код не подтверждён: ${err.message}`);}
}

async function refreshCloudFeed(){
  if(!isCloudAuthenticated())return;
  try{const cloud=await fetchPublicFeed();update(s=>{s.posts=cloud;s.cloud={...(s.cloud||{}),connected:true,serverOnline:true,lastSync:new Date().toISOString(),error:null};},{persist:false});cloudFeedLoaded=true;}catch(err){update(s=>{s.cloud={...(s.cloud||{}),connected:isCloudAuthenticated(),lastSync:null,error:err.message};},{persist:false});}
}

async function refreshCloudLiterature(){
  if(!isCloudAuthenticated())return;
  try{
    const data=await fetchCloudLiterature();
    update(s=>{
      const localWorks=(s.works||[]).filter(w=>!w.cloud);
      const localReviews=(s.reviews||[]).filter(r=>!r.cloud);
      s.works=[...localWorks,...(data.works||[])];
      s.reviews=[...localReviews,...(data.reviews||[])];
      if(s.ui.selectedWorkId&&!s.works.some(w=>w.id===s.ui.selectedWorkId))s.ui.selectedWorkId=null;
      if(s.ui.selectedStudioWorkId&&!s.works.some(w=>w.id===s.ui.selectedStudioWorkId))s.ui.selectedStudioWorkId=null;
    },{persist:false});
  }catch(err){console.warn('literature sync',err);}
}

async function refreshNotifications(renderIfChanged=false){
  if(!isCloudAuthenticated())return;
  try{
    const rows=await fetchNotifications();
    const prevUnread=(state.notifications||[]).filter(n=>!n.read_at).length;
    const nextUnread=(rows||[]).filter(n=>!n.read_at).length;
    update(s=>s.notifications=rows||[],{persist:false});
    if(renderIfChanged&&prevUnread!==nextUnread&&!document.activeElement?.matches('input,textarea,[contenteditable="true"]'))render();
  }catch(err){console.warn('notifications',err);}
}
async function refreshAdminData(renderAfter=false){
  if(!state.user?.isAdmin||!isCloudAuthenticated())return;
  try{
    const [reports,verification]=await Promise.all([fetchModerationReports(),fetchVerificationRequests()]);
    update(s=>{s.moderationReports=reports||[];s.verificationRequests=verification||[];},{persist:false});
    if(renderAfter)render();
  }catch(err){console.warn('admin sync',err);}
}
function notificationCenter(){
  const items=state.notifications||[];
  openModal(`<div class="notification-center"><div class="row spread"><div><span class="eyebrow">FRAKTUM</span><h2>Уведомления</h2></div>${items.some(n=>!n.read_at)?`<button data-action="notifications-read-all">Прочитать всё</button>`:''}</div><div class="notification-list">${items.length?items.map(n=>`<button class="notification-item ${n.read_at?'':'unread'}" data-action="notification-open" data-id="${n.id}" data-kind="${esc(n.entity_type||'')}" data-entity="${esc(n.entity_id||'')}"><span>${n.kind==='message'?'💬':n.kind==='review'?'✍':n.kind==='comment'?'↩':n.kind==='reaction'?'♥':'●'}</span><div><b>${esc(n.title)}</b><p>${esc(n.body||'')}</p><small>${new Date(n.created_at).toLocaleString('ru-RU')}</small></div></button>`).join(''):'<div class="empty"><h3>Новых событий нет</h3><p>Комментарии, рецензии и сообщения появятся здесь.</p></div>'}</div></div>`,'wide');
}
function reportDialog(targetType,targetId){
  openModal(`<h2>Пожаловаться</h2><p class="muted">Жалоба попадёт в закрытую очередь модерации FRAKTUM.</p><form id="reportForm"><input type="hidden" name="targetType" value="${esc(targetType)}"><input type="hidden" name="targetId" value="${esc(targetId)}"><label>Причина<select name="reason"><option>Спам</option><option>Оскорбления</option><option>Нарушение авторских прав</option><option>Опасный или запрещённый контент</option><option>Другое</option></select></label><label>Комментарий<textarea name="details" rows="4" placeholder="Что произошло?"></textarea></label><button class="primary wide">Отправить жалобу</button></form>`);
}
function publishChecklistDialog(){
  const x=collectEditor();if(!x)return;
  const w=state.works.find(z=>z.id===x.id);if(!w)return;
  const checks=[['Название',!!x.title],['Описание',x.summary.length>=20],['Жанр',x.genres.length>0],['Текст',x.content.trim().length>=100],['Обложка',!!(w.cover&& !w.cover.includes('reading-cover'))]];
  const ready=checks.filter(c=>c[1]).length;
  openModal(`<div class="publish-checklist"><span class="eyebrow">Публикация</span><h2>${esc(x.title||'Без названия')}</h2><p>Проверьте карточку произведения перед отправкой в раздел «Читать».</p><div class="publish-checks">${checks.map(([label,ok])=>`<div class="${ok?'ok':'warn'}"><b>${ok?'✓':'!'} ${label}</b><span>${ok?'готово':label==='Обложка'?'можно опубликовать и добавить позже':'нужно заполнить'}</span></div>`).join('')}</div><div class="modal-actions"><button data-action="close-modal">Вернуться</button><button data-action="preview-work">Предпросмотр</button><button class="primary" data-action="confirm-publish-work" ${ready<4?'disabled':''}>${w.publicationStatus==='published'?'Обновить публикацию':'Опубликовать'}</button></div></div>`,'wide');
}
function previewCurrentWork(){
  const x=collectEditor();if(!x)return;
  const w=state.works.find(z=>z.id===x.id);if(!w)return;
  openModal(`<div class="publish-preview"><span class="eyebrow">Предпросмотр карточки</span><div class="preview-work-card"><img src="${esc(w.cover||'/assets/home/reading-cover.png')}" alt=""><div><h2>${esc(x.title||'Без названия')}</h2><p class="muted">${esc(state.user.name)} · ${esc(x.kind)}</p><div>${x.genres.map(g=>`<span class="pill">${esc(g)}</span>`).join('')}</div><p>${esc(x.summary||'Описание ещё не добавлено.')}</p><small>${x.content.trim()?x.content.trim().split(/\s+/).length:0} слов · ~${Math.max(1,Math.ceil(x.content.length/900))} мин</small></div></div><div class="modal-actions"><button data-action="close-modal">Закрыть</button></div></div>`,'wide');
}
let lastChatSignature='';
async function refreshCloudChats(renderIfChanged=true){
  if(!isCloudAuthenticated())return;
  try{
    const data=await fetchMyConversations();
    let selectedId=state.ui.selectedChatId;
    if(!data.threads.some(t=>t.id===selectedId))selectedId=data.threads[0]?.id||null;
    if(selectedId){
      const selected=data.threads.find(t=>t.id===selectedId);
      if(selected)selected.messages=await fetchConversationMessages(selectedId);
    }
    const sig=JSON.stringify(data.threads.map(t=>[t.id,t.title,(t.messages||[]).map(m=>m.id)]));
    const changed=sig!==lastChatSignature;
    update(s=>{s.chatThreads=data.threads;s.peopleDirectory=data.people;s.friends=data.threads.filter(t=>t.type==='dm').flatMap(t=>t.memberIds).filter((x,i,a)=>a.indexOf(x)===i);s.ui.selectedChatId=selectedId;},{persist:false});
    const typing=document.activeElement?.closest?.('.thread-message-form');
    if(changed&&renderIfChanged&&!typing){lastChatSignature=sig;render();}
    else if(!changed||!renderIfChanged)lastChatSignature=sig;
  }catch(err){console.warn('chat sync',err);}
}
function startCloudPolling(){
  clearInterval(chatsPollTimer);clearInterval(incomingCallTimer);clearInterval(notificationsTimer);
  chatsPollTimer=setInterval(()=>refreshCloudChats(true),1800);
  incomingCallTimer=setInterval(pollIncomingCalls,1500);
  notificationsTimer=setInterval(()=>refreshNotifications(true),7000);
}
function stopCloudPolling(){clearInterval(chatsPollTimer);clearInterval(incomingCallTimer);clearInterval(notificationsTimer);chatsPollTimer=null;incomingCallTimer=null;notificationsTimer=null;}

async function pollIncomingCalls(){
  if(!isCloudAuthenticated()||activeRtc)return;
  try{
    const calls=await fetchIncomingCalls();
    const fresh=calls.find(c=>Date.now()-new Date(c.created_at).getTime()<60000&&!seenIncomingCalls.has(c.id));
    if(!fresh)return;
    seenIncomingCalls.add(fresh.id);
    const caller=fresh.caller?.nickname||fresh.caller?.username||'Пользователь';
    openModal(`<div class="incoming-call"><span class="eyebrow">Входящий ${fresh.mode==='video'?'видеозвонок':'аудиозвонок'}</span><h2>${esc(caller)}</h2><p class="muted">Звонок идёт через WebRTC. Браузер попросит доступ к ${fresh.mode==='video'?'камере и микрофону':'микрофону'}.</p><div class="modal-actions"><button class="danger" data-action="decline-cloud-call" data-id="${fresh.id}">Отклонить</button><button class="primary" data-action="accept-cloud-call" data-id="${fresh.id}">Принять</button></div></div>`,'wide');
  }catch(err){console.warn('incoming calls',err);}
}

function removeCallOverlay(){document.querySelector('#realCallOverlay')?.remove();}
function showCallOverlay({title,mode,status='Соединение…'}){
  removeCallOverlay();
  const box=document.createElement('section');box.id='realCallOverlay';box.className=`real-call-overlay ${mode==='video'?'video':'audio'}`;
  box.innerHTML=`<div class="real-call-head"><div><span class="eyebrow">${mode==='video'?'Видеозвонок':'Аудиозвонок'}</span><h3>${esc(title)}</h3><small id="realCallStatus">${esc(status)}</small></div><button class="danger" id="realCallHangup">Завершить</button></div>${mode==='video'?`<div class="call-videos"><video id="remoteCallVideo" autoplay playsinline></video><video id="localCallVideo" autoplay playsinline muted></video></div>`:`<div class="audio-call-orb">☎</div><audio id="remoteCallAudio" autoplay></audio>`}`;
  document.body.appendChild(box);box.querySelector('#realCallHangup')?.addEventListener('click',()=>endCall(true));
}
function setCallStatusText(text){const el=document.querySelector('#realCallStatus');if(el)el.textContent=text;}
async function setupRtc({callId,conversationId,peerId,title,mode,initiator}){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Браузер не поддерживает доступ к микрофону/камере');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'});
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
  const remoteStream=new MediaStream();
  stream.getTracks().forEach(track=>pc.addTrack(track,stream));
  pc.ontrack=e=>{e.streams[0]?.getTracks().forEach(track=>{if(!remoteStream.getTracks().some(t=>t.id===track.id))remoteStream.addTrack(track);});const v=document.querySelector(mode==='video'?'#remoteCallVideo':'#remoteCallAudio');if(v)v.srcObject=remoteStream;};
  pc.onicecandidate=e=>{if(e.candidate)sendCloudCallSignal(callId,peerId,'ice',e.candidate.toJSON()).catch(console.warn);};
  pc.onconnectionstatechange=()=>{const st=pc.connectionState;if(st==='connected')setCallStatusText('Соединено');else if(st==='connecting')setCallStatusText('Соединение…');else if(['failed','disconnected'].includes(st))setCallStatusText('Связь прервана');};
  activeRtc={callId,conversationId,peerId,title,mode,initiator,pc,localStream:stream,remoteStream,lastSignalId:0,pendingIce:[],statusPollCounter:0};
  update(s=>{s.activeCall={threadId:conversationId,callId,title,mode,startedAt:new Date().toISOString(),real:true};s.ui.chatTab='calls';s.ui.chatPanelOpen=true;},{persist:false});
  showCallOverlay({title,mode});
  const local=document.querySelector('#localCallVideo');if(local)local.srcObject=stream;
  callSignalTimer=setInterval(pollCallSignals,450);
  if(initiator){
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendCloudCallSignal(callId,peerId,'offer',{type:offer.type,sdp:offer.sdp});
  }
}
async function flushPendingIce(){
  if(!activeRtc?.pc.remoteDescription)return;
  for(const c of activeRtc.pendingIce.splice(0)){try{await activeRtc.pc.addIceCandidate(c);}catch(err){console.warn(err);}}
}
async function pollCallSignals(){
  if(!activeRtc)return;
  try{
    activeRtc.statusPollCounter=(activeRtc.statusPollCounter||0)+1;
    if(activeRtc.statusPollCounter%5===0){
      const status=await getCloudCall(activeRtc.callId);
      if(status&&['declined','ended','missed'].includes(status.status)){setCallStatusText(status.status==='declined'?'Звонок отклонён':'Звонок завершён');await finishLocalCall(false);return;}
    }
    const signals=await fetchCloudCallSignals(activeRtc.callId,activeRtc.lastSignalId);
    for(const sig of signals){
      activeRtc.lastSignalId=Math.max(activeRtc.lastSignalId,Number(sig.id)||0);
      if(sig.signal_type==='hangup'){await finishLocalCall(false);return;}
      if(sig.signal_type==='offer'&&!activeRtc.initiator){
        await activeRtc.pc.setRemoteDescription(new RTCSessionDescription(sig.payload));await flushPendingIce();
        const answer=await activeRtc.pc.createAnswer();await activeRtc.pc.setLocalDescription(answer);await sendCloudCallSignal(activeRtc.callId,activeRtc.peerId,'answer',{type:answer.type,sdp:answer.sdp});
      }else if(sig.signal_type==='answer'&&activeRtc.initiator){
        await activeRtc.pc.setRemoteDescription(new RTCSessionDescription(sig.payload));await flushPendingIce();
      }else if(sig.signal_type==='ice'){
        const candidate=new RTCIceCandidate(sig.payload);if(activeRtc.pc.remoteDescription)await activeRtc.pc.addIceCandidate(candidate);else activeRtc.pendingIce.push(candidate);
      }
    }
  }catch(err){console.warn('call signaling',err);}
}
async function acceptCloudCall(callId){
  try{
    const call=await getCloudCall(callId);if(!call||call.status!=='ringing')throw new Error('Звонок уже завершён');
    const peer=await getConversationPeer(call.conversation_id);await setCloudCallStatus(callId,'active');closeModal();
    await setupRtc({callId,conversationId:call.conversation_id,peerId:peer.id,title:peer.nickname||peer.username||'Пользователь',mode:call.mode,initiator:false});
  }catch(err){alert(`Не удалось принять звонок: ${err.message}`);}
}
async function declineCloudCall(callId){try{await setCloudCallStatus(callId,'declined');closeModal();}catch(err){alert(err.message);}}
async function finishLocalCall(updateServer=true){
  if(!activeRtc){removeCallOverlay();return;}
  const c=activeRtc;activeRtc=null;clearInterval(callSignalTimer);callSignalTimer=null;
  try{c.localStream?.getTracks().forEach(t=>t.stop());c.pc?.close();}catch{}
  removeCallOverlay();
  update(s=>{s.callHistory.push({id:c.callId,title:c.title,mode:c.mode==='video'?'Видео':'Аудио',endedAt:new Date().toLocaleString('ru-RU',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})});s.activeCall=null;s.ui.chatTab='calls';},{persist:false});
  if(updateServer){await sendCloudCallSignal(c.callId,c.peerId,'hangup',{}).catch(()=>{});await setCloudCallStatus(c.callId,'ended').catch(()=>{});}render();
}

function animateBookTurn({reader=false,direction=1}){
  if(bookFlipLocked)return;
  const w=state.works.find(x=>x.id===state.ui.selectedWorkId)||state.works.find(x=>x.id===document.querySelector('#workEditor')?.dataset.id);if(!w)return;
  const pages=w.bookPages||[];const field=reader?'readerBookIndex':'bookSpreadIndex';const current=Math.max(0,Number(state.ui[field]||0));
  const singlePage=window.matchMedia?.('(max-width:820px)')?.matches;
  let next;if(singlePage)next=current+(direction>0?1:-1);else if(direction>0)next=current===0?1:current+2;else next=current<=1?0:current-2;next=Math.max(0,Math.min(pages.length-1,next));if(next===current)return;
  const spread=document.querySelector(reader?'.reader-book-spread':'[data-book-spread]');if(!spread){update(s=>s.ui[field]=next,{persist:false});render();return;}
  bookFlipLocked=true;spread.classList.add(direction>0?'turn-next':'turn-prev');
  if(reader){const pct=Math.min(99,Math.round(((next+1)/Math.max(1,pages.length))*100));update(s=>{s.readingProgress[w.id]=pct;if(!s.library.reading.includes(w.id))s.library.reading.push(w.id);},{persist:true});if(w.cloud)saveCloudReadingProgress(w,{progress:pct,status:'reading'}).catch(()=>{});}
  setTimeout(()=>{update(s=>s.ui[field]=next,{persist:false});bookFlipLocked=false;render();},360);
}

function captureSelection(){
  const sel=window.getSelection(); const quote=sel?.toString().trim();
  if(quote && quote.length>=2) update(s=>s.ui.selectedQuote=quote,{persist:false});
}

function searchGlobal(q){
  q=(q||'').trim().toLowerCase(); if(!q)return;
  const w=state.works.find(x=>x.title.toLowerCase().includes(q)||x.author.toLowerCase().includes(q));
  if(w){update(s=>{s.ui.selectedWorkId=w.id;s.ui.page=w.publicationStatus==='published'?'work':'home';},{persist:false});render();return;}
  notify('Ничего не найдено в демо-данных');
}

app.addEventListener('click',async e=>{
  const figure=e.target.closest('.rich-editor .embedded-media');
  if(figure && !e.target.closest('.media-drag-handle')) selectMediaFigure(figure);
  else if(!figure && selectedMediaFigure && !e.target.closest('.studio-media')) selectMediaFigure(null);
  const el=e.target.closest('[data-action]'); if(!el)return;
  // A modal backdrop closes only when the backdrop itself is clicked.
  // Clicks on inputs, chips and controls inside the modal must stay inside the modal.
  if(el.classList.contains('modal-backdrop') && e.target.closest('[data-stop]')) return;
  const action=el.dataset.action;
  if(action==='choose-role'){signupRole=el.dataset.role;loginMode=false;otpPending=null;render();return;}
  if(action==='show-login'){loginMode=true;signupRole=null;otpPending=null;render();return;}
  if(action==='show-signup'){loginMode=false;signupRole=null;otpPending=null;render();return;}
  if(action==='auth-method'){authMethod=el.dataset.method==='phone'?'phone':'email';otpPending=null;render();return;}
  if(action==='cancel-otp'){otpPending=null;render();return;}
  if(action==='resend-otp'){return resendOtp();}
  if(action==='cloud-login'){forceAuthScreen=true;loginMode=true;signupRole=null;otpPending=null;render();return;}
  if(action==='cloud-logout'){stopCloudPolling();if(activeRtc)await finishLocalCall(false);await signOut();update(s=>{s.user=null;s.posts=[];s.chatThreads=[];s.peopleDirectory=[];s.friends=[];s.cloud={...(s.cloud||{}),connected:false};},{persist:false});loginMode=true;forceAuthScreen=false;render();return;}
  if(action==='back-onboarding'){signupRole=null;otpPending=null;render();return;}
  if(action==='navigate'){if(el.dataset.page==='admin')await refreshAdminData(false);go(el.dataset.page);return;}
  if(action==='toggle-sidebar'){update(s=>s.ui.sidebarOpen=!s.ui.sidebarOpen,{persist:false});render();return;}
  if(action==='start-evaluation') return startEvaluation();
  if(action==='evaluation-filters') return evaluationFiltersDialog();
  if(action==='close-modal'){closeModal();return;}
  if(action==='close-modal-local'){closeModal();return;}
  if(action==='switch-role') return switchRole();
  if(action==='open-work') return openWork(el.dataset.id);
  if(action==='work-details') return openWorkDetails(el.dataset.id);
  if(action==='start-reading') return openWork(el.dataset.id);
  if(action==='toggle-later') return toggleLibrary('later',el.dataset.id);
  if(action==='apply-read-filters') return applyReadFilters();
  if(action==='reset-read-filters') return resetReadFilters();
  if(action==='save-selection') return annotationDialog();
  if(action==='delete-annotation') return deleteAnnotation(el.dataset.work,el.dataset.scope||'evaluation',Number(el.dataset.index));
  if(action==='open-review') return reviewDialog(el.dataset.id,el.dataset.mode||'full');
  if(action==='react-review') return reactReview(el.dataset.id,el.dataset.kind);
  if(action==='reply-review') return replyReviewDialog(el.dataset.id);
  if(action==='report-review') return reportDialog('review',el.dataset.id);
  if(action==='profile-tab'){update(s=>s.ui.profileTab=el.dataset.tab,{persist:false});render();return;}
  if(action==='open-post') return postDialog();
  if(action==='open-notifications'){await refreshNotifications(false);notificationCenter();return;}
  if(action==='notifications-read-all'){await markAllNotificationsRead().catch(()=>{});await refreshNotifications(false);notificationCenter();return;}
  if(action==='notification-open'){await markNotificationRead(el.dataset.id).catch(()=>{});await refreshNotifications(false);closeModal();if(el.dataset.kind==='conversation'&&el.dataset.entity){update(s=>{s.ui.selectedChatId=el.dataset.entity;s.ui.page='messages';},{persist:false});await refreshCloudChats(false);}render();return;}
  if(action==='report-content') return reportDialog(el.dataset.targetType||'content',el.dataset.targetId||'');
  if(action==='refresh-admin'){await refreshAdminData(true);return;}
  if(action==='moderation-status'){await setModerationReportStatus(el.dataset.id,el.dataset.status);await refreshAdminData(true);return;}
  if(action==='resolve-verification'){await resolveAuthorVerification(el.dataset.id,el.dataset.status);await refreshAdminData(true);return;}
  if(action==='open-post-comments') return postCommentsDialog(el.dataset.id);
  if(action==='react-post-comment') return reactPostComment(el.dataset.post,el.dataset.id,el.dataset.kind);
  if(action==='like-post') return likePost(el.dataset.id);
  if(action==='new-work'){update(s=>{s.ui.selectedStudioWorkId='__new__';s.ui.createDraftType=null;s.ui.bookPageIndex=0;s.ui.bookViewMode=false;s.ui.bookSpreadIndex=0;},{persist:false});render();return;}
  if(action==='set-create-type'){update(s=>s.ui.createDraftType=el.dataset.type||null,{persist:false});render();return;}
  if(action==='start-create-project') return startCreateProject(el.dataset.type||'work',el.dataset.mode||'document');
  if(action==='studio-book-mode'){syncStudioEditor();update(s=>{s.ui.bookViewMode=el.dataset.mode==='book';if(s.ui.bookViewMode){const i=Math.max(0,s.ui.bookPageIndex||0);s.ui.bookSpreadIndex=i===0?0:(i%2===1?i:i-1);}},{persist:false});render();return;}
  if(action==='book-spread-next'){animateBookTurn({reader:false,direction:1});return;}
  if(action==='book-spread-prev'){animateBookTurn({reader:false,direction:-1});return;}
  if(action==='reader-book-next'){animateBookTurn({reader:true,direction:1});return;}
  if(action==='reader-book-prev'){animateBookTurn({reader:true,direction:-1});return;}
  if(action==='studio-focus-media'){document.querySelector('#studioMediaPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(action==='studio-toggle-grid'){update(s=>s.ui.studioGrid=!s.ui.studioGrid,{persist:false});document.querySelector('.word-canvas')?.classList.toggle('show-page-grid',!!state.ui.studioGrid);document.querySelector('#freePageCanvas')?.classList.toggle('show-canvas-grid',!!state.ui.studioGrid);return;}
  if(action==='editor-cmd'){execEditorCommand(el.dataset.cmd,el.dataset.value||null);return;}
  if(action==='editor-link'){const url=prompt('Ссылка (https://...)');if(url)execEditorCommand('createLink',url);return;}
  if(action==='insert-media'){insertMedia(el.dataset.src,el.dataset.name);return;}
  if(action==='canvas-add-text'){const c=document.querySelector('#freePageCanvas');addCanvasTextObject('text',c?PAGE_CANVAS_W*.18:110,c?PAGE_CANVAS_H*.16:150);return;}
  if(action==='canvas-add-note'){addCanvasTextObject('note',120,180);return;}
  if(action==='insert-canvas-media'){addCanvasImageObject(el.dataset.src,el.dataset.name);return;}
  if(action==='set-page-background'){setPageBackgroundImage(el.dataset.src);return;}
  if(action==='clear-page-background'){clearPageBackgroundImage();return;}
  if(action==='canvas-layer'){setCanvasLayer(el.dataset.layer);return;}
  if(action==='canvas-duplicate'){duplicateSelectedCanvasObject();return;}
  if(action==='canvas-lock'){toggleCanvasLock();return;}
  if(action==='canvas-delete'){deleteSelectedCanvasObject();return;}
  if(action==='media-wrap'){setMediaWrap(el.dataset.wrap);return;}
  if(action==='media-size'){setMediaSize(el.dataset.size);return;}
  if(action==='media-caption-toggle'){toggleMediaCaption();return;}
  if(action==='media-reset'){resetMediaPosition();return;}
  if(action==='delete-media'){if(selectedMediaFigure){selectedMediaFigure.remove();selectedMediaFigure=null;syncStudioEditor();save();updateEditorWordCount();}else notify('Сначала нажмите на картинку в тексте');return;}
  if(action==='book-page-select'){syncCurrentBookPage();const idx=Number(el.dataset.index)||0;update(s=>{s.ui.bookPageIndex=idx;s.ui.canvasSelectedObjectId=null;if(s.ui.bookViewMode)s.ui.bookSpreadIndex=idx===0?0:(idx%2===1?idx:idx-1);},{persist:false});render();return;}
  if(action==='book-page-prev'){syncCurrentBookPage();update(s=>{s.ui.bookPageIndex=Math.max(0,(s.ui.bookPageIndex||0)-1);s.ui.canvasSelectedObjectId=null;},{persist:false});render();return;}
  if(action==='book-page-next'){syncCurrentBookPage();const w=state.works.find(x=>x.id===document.querySelector('#workEditor')?.dataset.id);update(s=>{s.ui.bookPageIndex=Math.min(Math.max(0,(w?.bookPages?.length||1)-1),(s.ui.bookPageIndex||0)+1);s.ui.canvasSelectedObjectId=null;},{persist:false});render();return;}
  if(action==='add-book-page'){syncCurrentBookPage();const id=document.querySelector('#workEditor')?.dataset.id;update(s=>{const w=s.works.find(x=>x.id===id);if(w){const page=makeCanvasPage('content',w.title,w.author||s.user?.name||'');page.label=`Страница ${Math.max(1,w.bookPages.length-1)}`;w.bookPages.push(page);s.ui.bookPageIndex=w.bookPages.length-1;s.ui.bookViewMode=false;s.ui.canvasSelectedObjectId=null;}});render();return;}
  if(action==='delete-book-page'){syncCurrentBookPage();const id=document.querySelector('#workEditor')?.dataset.id;const idx=Number(el.dataset.index);update(s=>{const w=s.works.find(x=>x.id===id);if(!w||!w.bookPages?.[idx]||w.bookPages[idx].type!=='content')return;w.bookPages.splice(idx,1);s.ui.bookPageIndex=Math.max(0,Math.min(idx-1,w.bookPages.length-1));s.ui.bookSpreadIndex=Math.max(0,Math.min(s.ui.bookSpreadIndex||0,w.bookPages.length-1));});render();return;}
  if(action==='add-document-page'){syncDocumentPages();const id=document.querySelector('#workEditor')?.dataset.id;update(s=>{const w=s.works.find(x=>x.id===id);if(w)w.documentPages.push({id:'doc-'+Date.now(),html:'<p><br></p>'});});render();return;}
  if(action==='studio-select'){syncStudioEditor();update(s=>{s.ui.selectedStudioWorkId=el.dataset.id;s.ui.page='create';s.ui.bookPageIndex=0;s.ui.bookViewMode=false;s.ui.bookSpreadIndex=0;s.ui.canvasSelectedObjectId=null;},{persist:false});render();return;}
  if(action==='save-work') return saveWork('draft');
  if(action==='publish-work') return saveWork('published');
  if(action==='open-publish-checklist') return publishChecklistDialog();
  if(action==='confirm-publish-work'){closeModal();return saveWork('published');}
  if(action==='preview-work') return previewCurrentWork();
  if(action==='publish-evaluation') return saveWork('evaluation');
  if(action==='close-evaluation') return closeEvaluation();
  if(action==='new-version') return newVersion();
  if(action==='evaluate-next'){closeModal();return startEvaluation();}
  if(action==='save-notes') return saveNotes();
  if(action==='invite-specialist') return notify('Приглашение отправлено (демо)');
  if(action==='join-community') return joinCommunity(el.dataset.id);
  if(action==='open-community'){update(s=>{s.ui.selectedCommunityId=el.dataset.id;s.ui.page='community';},{persist:false});render();return;}
  if(action==='create-community') return communityDialog();
  if(action==='analytics'){update(s=>{s.ui.selectedWorkId=el.dataset.id;s.ui.page='analytics';},{persist:false});render();return;}
  if(action==='generate-summary') return generateSummary(el.dataset.id);
  if(action==='font-up'){readerFont=Math.min(26,readerFont+1);render();return;}
  if(action==='font-down'){readerFont=Math.max(14,readerFont-1);render();return;}
  if(action==='toggle-reader-theme'){readerTheme=(readerTheme+1)%3;render();return;}
  if(action==='edit-profile') return profileDialog();
  if(action==='toggle-chat-panel'){toggleChatPanel();return;}
  if(action==='chat-tab'){update(s=>{s.ui.chatTab=el.dataset.tab;s.ui.chatPanelOpen=true;const pool=s.chatThreads.filter(t=>el.dataset.tab==='groups'?t.type==='group':t.type==='dm');if(pool.length&&!pool.some(t=>t.id===s.ui.selectedChatId))s.ui.selectedChatId=pool[0].id;},{persist:false});render();return;}
  if(action==='open-thread'){update(s=>{s.ui.selectedChatId=el.dataset.id;s.ui.chatPanelOpen=true;const t=s.chatThreads.find(x=>x.id===el.dataset.id);s.ui.chatTab=t?.type==='group'?'groups':'chats';},{persist:false});await refreshCloudChats(false);render();return;}
  if(action==='select-thread'){update(s=>{s.ui.selectedChatId=el.dataset.id;},{persist:false});await refreshCloudChats(false);render();return;}
  if(action==='open-chat-person') return openChatWithPerson(el.dataset.id);
  if(action==='new-collab-group') return collaborationGroupDialog();
  if(action==='start-call') return startCall(el.dataset.id,el.dataset.mode||'audio');
  if(action==='accept-cloud-call') return acceptCloudCall(el.dataset.id);
  if(action==='decline-cloud-call') return declineCloudCall(el.dataset.id);
  if(action==='end-call') return endCall(true);
  if(action==='reset-demo'){reset();signupRole=null;render();return;}
});


app.addEventListener('change',e=>{
  const sel=e.target.closest('.word-command-select'); if(!sel)return;
  execEditorCommand(sel.dataset.command,sel.value);
});

app.addEventListener('submit',async e=>{
  if(e.target.id==='annotationForm'){e.preventDefault();saveAnnotation(new FormData(e.target));}
  if(e.target.id==='reviewForm'){e.preventDefault();await submitReview(new FormData(e.target));}
  if(e.target.id==='postForm'){e.preventDefault();await submitPost(new FormData(e.target));}
  if(e.target.id==='reportForm'){e.preventDefault();const fd=new FormData(e.target);try{await createReport({targetType:fd.get('targetType'),targetId:fd.get('targetId'),reason:fd.get('reason'),details:fd.get('details')});closeModal();notify('Жалоба отправлена модерации');}catch(err){alert(`Не удалось отправить жалобу: ${err.message}`);}}
  if(e.target.id==='authorVerificationForm'){e.preventDefault();const fd=new FormData(e.target);try{await requestAuthorVerification(String(fd.get('note')||''));closeModal();notify('Заявка отправлена. После проверки статус обновится.');}catch(err){alert(`Не удалось отправить заявку: ${err.message}`);}}
  if(e.target.id==='postCommentForm'){e.preventDefault();await submitPostComment(new FormData(e.target));}
  if(e.target.id==='evaluationFiltersForm'){e.preventDefault();saveEvaluationFilters(new FormData(e.target));}
  if(e.target.id==='readFiltersForm'){e.preventDefault();saveReadFilters(new FormData(e.target));}
  if(e.target.id==='communityForm'){e.preventDefault();submitCommunity(new FormData(e.target));}
  if(e.target.id==='profileForm'){e.preventDefault();await saveProfile(new FormData(e.target));}
  if(e.target.id==='replyReviewForm'){e.preventDefault();saveReviewReply(new FormData(e.target));}
  if(e.target.id==='friendForm'){e.preventDefault();await addFriend(new FormData(e.target));}
  if(e.target.id==='collabGroupForm'){e.preventDefault();await saveCollaborationGroup(new FormData(e.target));}
  if(e.target.matches('.thread-message-form')){e.preventDefault();await sendThreadMessage(e.target,new FormData(e.target));}
});

async function openChatWithPerson(personId){
  const p=state.peopleDirectory.find(x=>x.id===personId); if(!p)return;
  try{
    animateChatOpen=!state.ui.chatPanelOpen;
    const id=await getOrCreateDirectConversation(personId);
    update(s=>{s.ui.selectedChatId=id;s.ui.chatTab='chats';s.ui.chatPanelOpen=true;},{persist:false});
    await refreshCloudChats(false);render();
  }catch(err){alert(`Не удалось открыть чат: ${err.message}`);}
}

async function addFriend(fd){
  const username=String(fd.get('username')||'').trim().replace(/^@/,'');
  if(!username)return;
  try{
    const p=await findProfileByUsername(username);
    if(!p){notify(`@${username} не найден`);return;}
    if(p.id===state.user.id){notify('Нельзя написать самому себе');return;}
    animateChatOpen=!state.ui.chatPanelOpen;
    const id=await getOrCreateDirectConversation(p.id);
    update(s=>{s.ui.selectedChatId=id;s.ui.chatTab='chats';s.ui.chatPanelOpen=true;},{persist:false});
    await refreshCloudChats(false);render();
  }catch(err){alert(`Не удалось добавить пользователя: ${err.message}`);}
}

async function sendThreadMessage(form,fd){
  const text=String(fd.get('message')||'').trim(); if(!text)return;
  const id=form.dataset.thread;
  try{
    form.querySelector('input[name="message"]').value='';
    await sendCloudMessage(id,text);
    update(s=>s.ui.selectedChatId=id,{persist:false});
    await refreshCloudChats(false);render();
  }catch(err){alert(`Сообщение не отправлено: ${err.message}`);}
}

function collaborationGroupDialog(){
  if(state.user.role!=='author'){notify('Рабочие группы проектов доступны автору');return;}
  const friends=state.friends.map(id=>state.peopleDirectory.find(p=>p.id===id)).filter(Boolean);
  openModal(`<h2>Новая группа проекта</h2><p class="muted">Чат хранится в Supabase. Участники смогут получать сообщения со своих аккаунтов.</p><form id="collabGroupForm"><label>Название<input name="name" required placeholder="Например: Искусственная судьба — команда"></label><fieldset><legend>Участники</legend><div class="chip-checks">${friends.map(p=>`<label><input type="checkbox" name="members" value="${p.id}"><span>${esc(p.name)} · @${esc(p.username)}</span></label>`).join('')||'<p class="muted">Сначала откройте личный чат с пользователем по username.</p>'}</div></fieldset><p class="muted">Реальные WebRTC-звонки включены для личных чатов. Групповые звонки будут отдельным этапом.</p><button class="primary wide">Создать группу</button></form>`,'wide');
}

async function saveCollaborationGroup(fd){
  const name=String(fd.get('name')||'').trim(); if(!name)return;
  try{
    const members=fd.getAll('members');
    const id=await createCloudGroupConversation(name,members);
    update(s=>{s.ui.selectedChatId=id;s.ui.chatTab='groups';s.ui.chatPanelOpen=true;s.ui.modal=null;},{persist:false});
    await refreshCloudChats(false);render();
  }catch(err){alert(`Группа не создана: ${err.message}`);}
}

async function startCall(threadId,mode){
  const t=state.chatThreads.find(x=>x.id===threadId); if(!t)return;
  if(t.type!=='dm'){notify('Реальные групповые звонки пока не включены. Откройте личный чат.');return;}
  if(activeRtc){notify('Сначала завершите текущий звонок');return;}
  try{
    const peer=await getConversationPeer(threadId);
    const call=await createCloudCall(threadId,mode);
    if(!call)throw new Error('Сервер не создал звонок');
    await setupRtc({callId:call.id,conversationId:threadId,peerId:peer.id,title:peer.nickname||peer.username||t.title,mode:call.mode,initiator:true});
    render();
  }catch(err){
    if(activeRtc)await finishLocalCall(false);
    alert(`Не удалось начать звонок: ${err.message}`);
  }
}

async function endCall(updateServer=true){
  if(activeRtc)return finishLocalCall(updateServer);
  update(s=>s.activeCall=null,{persist:false});removeCallOverlay();render();
}

function switchRole(){
  if(state.user.role==='author'){ notify('Автор уже имеет все возможности читателя.'); return; }
  if(state.user.verified){ update(s=>{s.user.role='author';s.ui.page='create';});render();return; }
  openModal(`<h2>Стать автором</h2><p>Для закрытой beta мы используем ручную верификацию: заявка попадает администратору FRAKTUM. Документы на сайте не хранятся.</p><form id="authorVerificationForm"><label>Коротко о себе<textarea name="note" rows="5" placeholder="Что вы пишете, есть ли уже опубликованные тексты или профиль автора"></textarea></label><button class="primary wide">Отправить заявку</button></form>`);
}

function openWorkDetails(id){
  const w=state.works.find(x=>x.id===id); if(!w||w.publicationStatus!=='published'){notify('Полная версия этого произведения пока не опубликована');return;}
  update(s=>{s.ui.selectedWorkId=id;s.ui.page='work';},{persist:false});render();
}
function openWork(id){
  const w=state.works.find(x=>x.id===id); if(!w||w.publicationStatus!=='published'){notify('Полная версия этого произведения пока не опубликована');return;}
  update(s=>{s.ui.selectedWorkId=id;s.ui.readerBookIndex=0;s.ui.page='reader'; if(!s.library.reading.includes(id)&&!s.library.completed.includes(id))s.library.reading.push(id); if(s.readingProgress[id]==null)s.readingProgress[id]=0;}); if(w.cloud)saveCloudReadingProgress(w,{progress:Number(state.readingProgress[id]||0),status:'reading'}).catch(()=>{});render();
}
async function toggleLibrary(bucket,id){ let added=false;update(s=>{const a=s.library[bucket];const i=a.indexOf(id);if(i>=0)a.splice(i,1);else{a.push(id);added=true;}});const w=state.works.find(x=>x.id===id);if(w?.cloud&&bucket==='later')await saveCloudReadingProgress(w,{progress:Number(state.readingProgress[id]||0),status:added?'read_later':'reading'}).catch(()=>{});render(); }

function saveReadFilters(fd){
  update(s=>{s.ui.readFilters={query:String(fd.get('query')||'').trim(),genre:String(fd.get('genre')||''),length:String(fd.get('length')||'')};s.ui.page='read';},{persist:true});render();
}
function applyReadFilters(){
  const form=document.querySelector('#readFiltersForm'); if(form)saveReadFilters(new FormData(form));
}
function resetReadFilters(){update(s=>s.ui.readFilters={query:'',genre:'',length:''});render();}

function startEvaluation(){
  const candidates=pages.getEvaluationCandidates();
  if(!candidates.length){notify('По текущим фильтрам нет подходящих отрывков');return;}
  const current=state.ui.evaluationWorkId;
  const currentIndex=candidates.findIndex(w=>w.id===current);
  const next=candidates[(currentIndex+1+candidates.length)%candidates.length]||candidates[0];
  update(s=>{s.ui.evaluationWorkId=next.id;s.ui.page='evaluation';s.ui.selectedQuote='';},{persist:false});
  render();
}

function evaluationFiltersDialog(){
  const f=state.ui.evaluationFilters||{genres:[],kinds:[],length:'any'};
  const kinds=['Роман','Рассказ','Повесть','Стихотворение','Фрагмент'];
  openModal(`<h2>Фильтр оценки</h2><p class="muted">Настройте, какие короткие отрывки будут попадаться в режиме «Оценить».</p><form id="evaluationFiltersForm"><fieldset><legend>Жанры</legend><div class="chip-checks">${GENRES.map(g=>`<label><input type="checkbox" name="genres" value="${g}" ${(f.genres||[]).includes(g)?'checked':''}><span>${g}</span></label>`).join('')}</div></fieldset><fieldset><legend>Тип произведения</legend><div class="chip-checks">${kinds.map(k=>`<label><input type="checkbox" name="kinds" value="${k}" ${(f.kinds||[]).includes(k)?'checked':''}><span>${k}</span></label>`).join('')}</div></fieldset><label>Размер отрывка<select name="length"><option value="any" ${f.length==='any'?'selected':''}>Любой, до 5 минут</option><option value="tiny" ${f.length==='tiny'?'selected':''}>Очень короткий, до 2 минут</option><option value="short" ${f.length==='short'?'selected':''}>Обычный, 3–5 минут</option></select></label><button class="primary wide">Сохранить фильтр</button></form>`,'wide');
}
function saveEvaluationFilters(fd){
  update(s=>{s.ui.evaluationFilters={genres:fd.getAll('genres'),kinds:fd.getAll('kinds'),length:String(fd.get('length')||'any')};s.ui.evaluationWorkId=null;s.ui.modal=null;s.ui.page='evaluate';});
  render();
}

async function postCommentsDialog(postId){
  const post=state.posts.find(p=>p.id===postId); if(!post)return;
  let comments=state.postComments.filter(c=>c.postId===postId);
  if(post.cloud){
    openModal(`<h2>Комментарии</h2><p class="muted">Загрузка из облака…</p>`,'wide');
    try{comments=await fetchPostComments(post.cloudId);}catch(err){alert(err.message);comments=[];}
  }
  const cards=comments.length?comments.map(c=>`<article class="post-comment"><div class="row spread"><b>${esc(c.author)}</b><small>${esc(c.time||'')}</small></div><p>${esc(c.text)}</p><div class="reaction-bar"><button class="${c.myReaction==='helpful'?'active':''}" data-action="react-post-comment" data-post="${postId}" data-id="${c.id}" data-kind="helpful">👍 Полезно ${c.reactions?.helpful||0}</button><button class="${c.myReaction==='disagree'?'active':''}" data-action="react-post-comment" data-post="${postId}" data-id="${c.id}" data-kind="disagree">≠ Не согласен ${c.reactions?.disagree||0}</button><button class="${c.myReaction==='unhelpful'?'active':''}" data-action="react-post-comment" data-post="${postId}" data-id="${c.id}" data-kind="unhelpful">👎 Бесполезно ${c.reactions?.unhelpful||0}</button><button data-action="report-content" data-target-type="comment" data-target-id="${c.id}">⚑</button></div></article>`).join(''):'<p class="muted">Комментариев пока нет. Будьте первым.</p>';
  openModal(`<div class="comments-modal-head"><div><span class="eyebrow">${esc(post.role||'Пользователь')}</span><h2>Комментарии к посту</h2></div><span>${comments.length} всего</span></div><blockquote>${esc(post.text)}</blockquote><section class="post-comments-list">${cards}</section><form id="postCommentForm"><input type="hidden" name="postId" value="${postId}"><label>Ваш комментарий<textarea name="text" rows="4" required placeholder="Напишите мнение..."></textarea></label><button class="primary wide">Отправить комментарий</button></form>`,'wide');
}
async function submitPostComment(fd){
  const postId=String(fd.get('postId')); const text=String(fd.get('text')||'').trim(); if(!text)return;
  const post=state.posts.find(x=>x.id===postId);
  if(!post?.cloud){notify('Комментарии доступны только для серверных постов');return;}
  try{await createCloudComment(post.cloudId,text);await refreshCloudFeed();closeModal();await postCommentsDialog(postId);}catch(err){alert(err.message);}
}
async function reactPostComment(postId,commentId,kind){
  const post=state.posts.find(x=>x.id===postId);
  if(!post?.cloud){notify('Реакции доступны только для серверных комментариев');return;}
  try{await setCloudCommentReaction(commentId,kind);await postCommentsDialog(postId);}catch(err){alert(err.message);}
}

function annotationDialog(){
  const quote=(state.ui.selectedQuote||'').trim(); if(!quote){notify('Сначала выделите фразу в тексте');return;}
  const scope=state.ui.page==='evaluation'?'evaluation':'full';
  openModal(`<h2>Пометка к тексту</h2><blockquote>“${esc(quote.slice(0,500))}”</blockquote><form id="annotationForm"><input type="hidden" name="scope" value="${scope}"><input type="hidden" name="quote" value="${esc(quote)}"><label>Тип<select name="type">${ANNOTATION_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Комментарий<textarea name="comment" rows="4" placeholder="Почему вы это отметили?"></textarea></label><div class="modal-actions"><button type="button" data-action="close-modal" onclick="this.closest('.modal-backdrop').remove()">Отмена</button><button class="primary">Сохранить пометку</button></div></form>`);
}
function saveAnnotation(fd){const w=state.ui.page==='evaluation'?state.ui.evaluationWorkId:state.ui.selectedWorkId;const scope=String(fd.get('scope')||'full');const key=`${w}:${scope}`;const type=fd.get('type');const label=ANNOTATION_TYPES.find(x=>x[0]===type)?.[1]||type;update(s=>{(s.annotations[key]??=[]).push({type,label,quote:String(fd.get('quote')).slice(0,800),comment:String(fd.get('comment')||'').trim()});s.ui.selectedQuote='';s.ui.modal=null;});render();}
function deleteAnnotation(work,scope,index){const key=`${work}:${scope}`;update(s=>s.annotations[key]?.splice(index,1));render();}

function reviewDialog(workId,scope='full'){
  const w=state.works.find(x=>x.id===workId); const existing=state.reviews.find(r=>r.workId===workId&&r.version===w.version&&r.authorId===state.user.id&&((r.scope||'evaluation')===scope));
  openModal(`<h2>${existing?'Изменить рецензию':'Полноценная рецензия'}</h2><p>${esc(w.title)} · версия ${esc(w.version)}</p><form id="reviewForm"><input type="hidden" name="workId" value="${w.id}"><input type="hidden" name="scope" value="${scope}"><label>Общая оценка<select name="rating">${[5,4,3,2,1].map(n=>`<option value="${n}" ${existing?.rating===n?'selected':''}>${n} / 5</option>`).join('')}</select></label><div class="rating-grid">${FEEDBACK_CATEGORIES.map(c=>`<label>${c}<select name="cat:${c}">${[5,4,3,2,1].map(n=>`<option value="${n}" ${existing?.categories?.[c]===n?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div><label>Общее мнение<textarea name="comment" rows="7" minlength="30" required placeholder="Минимум 30 символов. Что работает, что стоит улучшить и почему?">${esc(existing?.comment||'')}</textarea></label><label class="toggle"><input type="checkbox" name="anonymous" ${existing?.anonymous?'checked':''}> Опубликовать анонимно</label><p class="muted">За полноценную рецензию начисляется XP. Пометки внутри текста также учитываются.</p><button class="primary wide">Опубликовать рецензию</button></form>`,'wide');
}
async function submitReview(fd){
  const workId=String(fd.get('workId')); const scope=String(fd.get('scope')||'full'); const w=state.works.find(x=>x.id===workId); const comment=String(fd.get('comment')||'').trim(); if(comment.length<30){alert('Нужно минимум 30 символов.');return;}
  const cats={}; FEEDBACK_CATEGORIES.forEach(c=>cats[c]=Number(fd.get('cat:'+c)||0));
  const annotationKey=`${workId}:${scope}`;
  let earned=0; let wasFirst=false;
  update(s=>{
    let r=s.reviews.find(x=>x.workId===workId&&x.version===w.version&&x.authorId===s.user.id&&((x.scope||'evaluation')===scope));
    wasFirst=!r;
    const payload={id:r?.id||'r-'+Date.now(),workId,version:w.version,scope,authorId:s.user.id,author:s.user.name,anonymous:fd.get('anonymous')==='on',rating:Number(fd.get('rating')),comment,categories:cats,annotations:structuredClone(s.annotations[annotationKey]||[]),reactions:r?.reactions||{helpful:0,disagree:0,unhelpful:0},createdAt:new Date().toISOString()};
    if(r)Object.assign(r,payload);else s.reviews.push(payload);
    if(wasFirst){earned=50+(payload.annotations.length*10);s.user.xp+=earned;s.user.reputation+=5;s.works.filter(x=>x.authorId===s.user.id).forEach(x=>x.authorActivity=(x.authorActivity||0)+4);}
    if(scope==='full'){
      const current=s.reviews.filter(x=>x.workId===workId&&x.version===w.version&&x.scope==='full'); if(current.length){w.rating=current.reduce((a,x)=>a+x.rating,0)/current.length;w.ratingsCount=current.length;}
      s.library.reading=s.library.reading.filter(id=>id!==workId); if(!s.library.completed.includes(workId))s.library.completed.push(workId); s.readingProgress[workId]=100; s.ui.page='work';s.ui.selectedWorkId=workId;
    }else{
      s.ui.page='evaluate';s.ui.evaluationWorkId=null;
    }
    s.ui.modal=null;
  });
  const localReview=state.reviews.find(x=>x.workId===workId&&x.version===w.version&&x.authorId===state.user.id&&((x.scope||'evaluation')===scope));
  if(w.cloud&&localReview){try{const savedReview=await saveCloudReview({work:w,review:localReview});if(savedReview)update(s=>{const r=s.reviews.find(x=>x.id===localReview.id);if(r){r.cloud=true;r.cloudId=savedReview.id;}},{persist:true});}catch(err){alert(`Рецензия сохранена локально, но не отправлена на сервер: ${err.message}`);}}
  if(scope==='full'&&w.cloud)saveCloudReadingProgress(w,{progress:100,status:'completed'}).catch(()=>{});
  if(scope==='evaluation'){
    openModal(`<div class="review-success"><span class="eyebrow">Рецензия опубликована</span><h2>${wasFirst?`+${earned} XP`:'Рецензия обновлена'}</h2><p>Отзыв привязан к версии ${esc(w.version)}. Можно сразу перейти к следующему короткому отрывку.</p><div class="actions"><button data-action="navigate" data-page="evaluate">Закончить</button><button class="primary" data-action="evaluate-next">ОЦЕНИТЬ ДАЛЕЕ →</button></div></div>`);
  }else{
    notify(wasFirst?`Произведение прочитано. +${earned} XP за рецензию`:'Рецензия обновлена');
  }
}
async function reactReview(id,kind){const review=state.reviews.find(x=>x.id===id);if(review?.cloudId){try{await setCloudReviewReaction(review.cloudId,kind);await refreshCloudLiterature();render();return;}catch(err){alert(`Реакция не сохранена: ${err.message}`);return;}}update(s=>{const r=s.reviews.find(x=>x.id===id);if(!r)return;r.reactions??={helpful:0,disagree:0,unhelpful:0};const prev=r.myReaction||null;if(prev===kind){r.reactions[kind]=Math.max(0,(r.reactions[kind]||0)-1);r.myReaction=null;}else{if(prev)r.reactions[prev]=Math.max(0,(r.reactions[prev]||0)-1);r.reactions[kind]=(r.reactions[kind]||0)+1;r.myReaction=kind;}});render();}
function replyReviewDialog(id){const r=state.reviews.find(x=>x.id===id);if(!r)return;openModal(`<h2>Ответить на рецензию</h2><form id="replyReviewForm"><input type="hidden" name="id" value="${r.id}"><label>Ответ автора<textarea name="reply" rows="5" required>${esc(r.authorReply||'')}</textarea></label><button class="primary wide">Опубликовать ответ</button></form>`);}
function saveReviewReply(fd){const id=fd.get('id');const reply=String(fd.get('reply')||'').trim();if(!reply)return;update(s=>{const r=s.reviews.find(x=>x.id===id);if(r)r.authorReply=reply;s.ui.modal=null;});render();}

function postDialog(){openModal(`<h2>Новый пост</h2><form id="postForm"><label>Текст<textarea name="text" rows="5" placeholder="Что хотите рассказать?"></textarea></label><label>Фото или видео<input name="media" type="file" multiple accept="image/*,video/mp4,video/webm"></label><p class="muted">Фото и видео загружаются в Supabase Storage. Для медиа нужен облачный вход.</p><button class="primary wide">Опубликовать</button></form>`,'wide');}
async function submitPost(fd){
  const text=String(fd.get('text')||'').trim();const files=fd.getAll('media').filter(x=>x&&x.size);if(!text&&!files.length)return;
  if(!isCloudAuthenticated()){alert('Сессия закончилась. Войдите снова.');loginMode=true;render();return;}
  try{await createCloudPost({text,files});update(s=>{s.ui.modal=null;},{persist:false});await refreshCloudFeed();render();}catch(err){alert(`Не удалось опубликовать: ${err.message}`);}
}
async function likePost(id){const p=state.posts.find(x=>x.id===id);if(!p?.cloud){notify('Этот пост не является серверным');return;}try{await toggleCloudPostLike(p.cloudId);await refreshCloudFeed();render();}catch(err){alert(err.message);}}

function collectEditor(){
  const f=document.querySelector('#workEditor');if(!f)return null;syncStudioEditor();const fd=new FormData(f);const w=state.works.find(x=>x.id===f.dataset.id);if(!w)return null;
  let content='';
  if(w.editorMode==='book') content=(w.bookPages||[]).filter(p=>p.type==='content').map(p=>(p.canvas?.objects||[]).filter(o=>o.type==='text').map(o=>textFromHtml(o.html)).filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
  else content=(w.documentPages||[]).map(p=>textFromHtml(p.html)).filter(Boolean).join('\n\n');
  const evaluationText=w.creationType==='evaluation'?content:String(fd.get('evaluationText')||w.evaluationText||'');
  return {id:f.dataset.id,title:String(fd.get('title')||w.title||'').trim(),kind:fd.get('kind')||w.kind,genres:String(fd.get('genres')||'').split(',').map(x=>x.trim()).filter(Boolean),summary:String(fd.get('summary')||'').trim(),targetType:String(fd.get('targetType')||w.targetType||'Фрагмент'),evaluationTarget:String(fd.get('evaluationTarget')||w.evaluationTarget||'Фрагмент').trim(),evaluationText,feedbackWanted:fd.getAll('feedback'),content};
}
async function saveWork(mode='draft'){
  const x=collectEditor(); if(!x||!x.title){alert('Укажите название.');return;}
  const current=state.works.find(z=>z.id===x.id); const fragment=current?.creationType==='evaluation';
  if(mode==='published'&&!x.content.trim()){alert('Чтобы опубликовать полное произведение, добавьте текст.');return;}
  if(mode==='evaluation'&&!x.evaluationText.trim()&&!x.content.trim()){alert('Добавьте текст для оценки.');return;}
  update(s=>{
    const w=s.works.find(z=>z.id===x.id); if(!w)return;
    Object.assign(w,{title:x.title,kind:x.kind,genres:x.genres,summary:x.summary,targetType:x.targetType,evaluationTarget:x.evaluationTarget,evaluationText:x.evaluationText,feedbackWanted:x.feedbackWanted,content:x.content,minutes:Math.max(1,Math.ceil(x.content.length/900))});
    if(w.editorMode==='book'){const cover=w.bookPages?.find(p=>p.type==='cover');const title=w.bookPages?.find(p=>p.type==='title');if(cover){cover.title=w.title;cover.author=w.author;}if(title){title.title=w.title;title.author=w.author;}if(cover?.canvas?.background?.image)w.cover=cover.canvas.background.image;}
    if(mode==='published'&&!fragment){const first=w.publicationStatus!=='published';w.publicationStatus='published';w.publishedAt=w.publishedAt||new Date().toISOString();if(first)s.user.xp+=10;}
    if(mode==='evaluation'){const first=w.evaluationStatus!=='open';w.evaluationStatus='open';w.evaluationOpenedAt=new Date().toISOString();if(first)s.user.xp+=5;w.authorActivity=(w.authorActivity||0)+3;}
    w.status=w.evaluationStatus==='open'?'evaluation':w.publicationStatus==='published'?'published':'draft';
  });
  const local=state.works.find(z=>z.id===x.id);
  if(isCloudAuthenticated()&&state.user?.role==='author'&&state.user?.verified&&local){
    try{
      const result=await saveCloudWork(local,{mode});
      const oldId=local.id;const newId=`cloud:${result.work.id}`;
      update(s=>{const w=s.works.find(z=>z.id===oldId);if(!w)return;w.id=newId;w.cloud=true;w.cloudId=result.work.id;w.cloudVersionId=result.version.id;w.version=String(result.version.version_no);if(s.ui.selectedStudioWorkId===oldId)s.ui.selectedStudioWorkId=newId;if(s.ui.selectedWorkId===oldId)s.ui.selectedWorkId=newId;for(const key of ['later','reading','completed'])s.library[key]=s.library[key].map(id=>id===oldId?newId:id);if(s.readingProgress[oldId]!=null){s.readingProgress[newId]=s.readingProgress[oldId];delete s.readingProgress[oldId];}});
    }catch(err){alert(`Локально сохранено, но Supabase не синхронизирован: ${err.message}`);return;}
  }
  const msg=mode==='published'?'Произведение опубликовано в разделе «Читать»':mode==='evaluation'?'Текст опубликован в разделе «Оценить»':'Черновик сохранён'; notify(msg);
}

function closeEvaluation(){
  syncStudioEditor();const id=document.querySelector('#workEditor')?.dataset.id;const w=state.works.find(x=>x.id===id);if(!w)return;
  update(s=>{w.evaluationStatus='closed';w.status=w.publicationStatus==='published'?'published':'draft';});notify('Приём новых оценок закрыт. Старые рецензии сохранены.');
}
function newVersion(){
  syncStudioEditor();const id=document.querySelector('#workEditor')?.dataset.id;const w=state.works.find(x=>x.id===id);if(!w)return;const [a,b]=w.version.split('.').map(Number);
  update(s=>{w.version=`${a}.${(b||0)+1}`;w.cloudVersionId=null;w.publicationStatus='draft';w.evaluationStatus='closed';w.status='draft';});notify('Создана новая версия. Старые отзывы остались у предыдущей версии.');
}

function profileDialog(){const u=state.user;openModal(`<h2>Редактировать профиль</h2><form id="profileForm"><div class="form-grid two"><label>Никнейм<input name="nickname" value="${esc(u.nickname||u.name||'')}"></label><label>Username<input name="username" value="${esc(u.username||'')}"></label></div><div class="form-grid two"><label>Имя<input name="firstName" value="${esc(u.firstName||'')}"></label><label>Фамилия<input name="lastName" value="${esc(u.lastName||'')}"></label></div><fieldset><legend>Желаемые жанры</legend><div class="chip-checks">${GENRES.map(g=>`<label><input type="checkbox" name="genres" value="${g}" ${(u.preferences||[]).includes(g)?'checked':''}><span>${g}</span></label>`).join('')}</div></fieldset><fieldset><legend>Не показывать</legend><div class="chip-checks muted-checks">${GENRES.map(g=>`<label><input type="checkbox" name="avoid" value="${g}" ${(u.avoid||[]).includes(g)?'checked':''}><span>${g}</span></label>`).join('')}</div></fieldset><button class="primary wide">Сохранить</button></form>`,'wide');}
async function saveProfile(fd){const nickname=String(fd.get('nickname')||'').trim();const firstName=String(fd.get('firstName')||'').trim();const lastName=String(fd.get('lastName')||'').trim();const username=String(fd.get('username')||'').trim().replace(/^@/,'');const preferences=fd.getAll('genres');const avoid=fd.getAll('avoid').filter(x=>!preferences.includes(x));if(isCloudAuthenticated()){try{await updateMyProfile({nickname,first_name:firstName,last_name:lastName,username,wanted_genres:preferences,unwanted_genres:avoid});}catch(err){alert(`Профиль не синхронизирован: ${err.message}`);return;}}update(s=>{Object.assign(s.user,{nickname,name:nickname,firstName,lastName,username,preferences,avoid});s.ui.modal=null;});render();}

async function bootstrap(){
  const serverOnline=await checkServerConnection();
  update(s=>{s.cloud={...(s.cloud||{}),serverOnline};},{persist:false});
  await ensureSession().catch(()=>null);
  const auth=getSession();
  if(auth?.user?.id){
    try{
      const profile=await getMyProfile();
      if(profile){
        const user=cloudUserFrom(profile,auth.user,state.user||{});
        update(s=>{s.user=user;s.cloud={...(s.cloud||{}),connected:true,serverOnline:true};},{persist:true});
        await refreshCloudLiterature();await refreshCloudFeed();await refreshCloudChats(false);await refreshNotifications(false);if(user.isAdmin)await refreshAdminData(false);startCloudPolling();
      }else update(s=>s.user=null,{persist:false});
    }catch(err){console.warn('bootstrap profile',err);update(s=>s.user=null,{persist:false});}
  }else{
    stopCloudPolling();update(s=>{s.user=null;s.posts=[];s.chatThreads=[];s.peopleDirectory=[];s.friends=[];s.cloud={...(s.cloud||{}),connected:false};},{persist:false});
  }
  authReady=true;render();
}
bootstrap();
