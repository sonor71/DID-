import {seedWorks, seedPosts, seedPostComments, seedCommunities, seedPeople} from './data.js';

const KEY='d20-platform-v4';

function textToHtml(text){
  return String(text||'').split(/\n\n+/).map(p=>`<p>${p.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))}</p>`).join('') || '<p><br></p>';
}
const CANVAS_W=760;
const CANVAS_H=1080;
function textObject(id,html,x=72,y=80,w=616,h=880,extra={}){
  return {id,type:'text',x,y,w,h,z:1,rotation:0,html:html||'<p><br></p>',flow:true,locked:false,style:{fontFamily:'Georgia',fontSize:18,lineHeight:1.55,color:null,align:'left',background:'transparent',padding:6,...(extra.style||{})},...extra};
}
function canvasForLegacyPage(page,work,index){
  const p=page||{}; const now=work.id||Date.now();
  if(p.canvas&&Array.isArray(p.canvas.objects)){
    return {
      background:{color:'#f7f1e5',image:'',fit:'cover',position:'center',...(p.canvas.background||{})},
      textColor:p.canvas.textColor||'#191715',
      objects:p.canvas.objects.map((o,i)=>({
        id:o.id||`obj-${now}-${index}-${i}`,
        type:o.type==='image'?'image':'text',
        x:Number.isFinite(Number(o.x))?Number(o.x):70,
        y:Number.isFinite(Number(o.y))?Number(o.y):80,
        w:Number.isFinite(Number(o.w))?Number(o.w):(o.type==='image'?260:620),
        h:Number.isFinite(Number(o.h))?Number(o.h):(o.type==='image'?220:860),
        z:Number.isFinite(Number(o.z))?Number(o.z):i+1,
        rotation:Number(o.rotation)||0,
        locked:!!o.locked,
        ...(o.type==='image'?{src:o.src||'',alt:o.alt||'',fit:o.fit||'cover',radius:Number(o.radius)||0,opacity:o.opacity==null?1:Number(o.opacity),wrap:o.wrap||'auto',gap:Number(o.gap)||14}:{html:o.html||'<p><br></p>',flow:o.flow!==false,role:o.role||'',style:{fontFamily:'Georgia',fontSize:18,lineHeight:1.55,color:null,align:'left',background:'transparent',padding:6,...(o.style||{})}})
      }))
    };
  }
  if(p.type==='cover'){
    return {background:{color:'#101d2d',image:p.image||work.cover||'',fit:'cover',position:'center'},textColor:'#ffffff',objects:[
      textObject(`cover-title-${now}`,`<div>${p.title||work.title||''}</div>`,72,150,616,210,{role:'title',flow:false,z:3,style:{fontFamily:'Georgia',fontSize:54,lineHeight:1.05,color:'#ffffff',align:'center',background:'transparent',padding:8}}),
      textObject(`cover-sub-${now}`,`<div>${p.subtitle||''}</div>`,118,390,524,100,{role:'subtitle',flow:false,z:3,style:{fontFamily:'Georgia',fontSize:22,lineHeight:1.25,color:'#ffffff',align:'center',background:'transparent',padding:6}}),
      textObject(`cover-author-${now}`,`<div>${p.author||work.author||''}</div>`,150,830,460,90,{role:'author',flow:false,z:3,style:{fontFamily:'Georgia',fontSize:20,lineHeight:1.25,color:'#ffffff',align:'center',background:'transparent',padding:6}})
    ]};
  }
  if(p.type==='title'){
    return {background:{color:'#f7f1e5',image:'',fit:'cover',position:'center'},textColor:'#191715',objects:[
      textObject(`title-main-${now}`,`<div>${p.title||work.title||''}</div>`,90,170,580,180,{role:'title',flow:false,z:2,style:{fontFamily:'Georgia',fontSize:42,lineHeight:1.08,color:'#191715',align:'center',background:'transparent',padding:8}}),
      textObject(`title-sub-${now}`,`<div>${p.subtitle||''}</div>`,130,370,500,120,{role:'subtitle',flow:false,z:2,style:{fontFamily:'Georgia',fontSize:22,lineHeight:1.3,color:'#342f2b',align:'center',background:'transparent',padding:6}}),
      textObject(`title-author-${now}`,`<div>${p.author||work.author||''}</div>`,150,630,460,90,{role:'author',flow:false,z:2,style:{fontFamily:'Georgia',fontSize:21,lineHeight:1.3,color:'#191715',align:'center',background:'transparent',padding:6}}),
      textObject(`title-year-${now}`,`<div>${p.year||String(new Date().getFullYear())}</div>`,260,920,240,70,{role:'year',flow:false,z:2,style:{fontFamily:'Georgia',fontSize:16,lineHeight:1.2,color:'#514a43',align:'center',background:'transparent',padding:4}})
    ]};
  }
  return {background:{color:'#f7f1e5',image:'',fit:'cover',position:'center'},textColor:'#191715',objects:[textObject(`flow-${now}-${index}`,p.html||textToHtml(work.content||''),72,72,616,936,{role:'body',flow:true,z:1})]};
}
function normalizeWork(work){
  const w={...work};
  if(!w.publicationStatus) w.publicationStatus=w.status==='draft'?'draft':'published';
  if(!w.evaluationStatus) w.evaluationStatus=w.status==='evaluation'?'open':'closed';
  if(!w.targetType) w.targetType=w.evaluationTarget==='Весь текст'?'Всё произведение':'Фрагмент';
  if(!w.evaluationText) w.evaluationText='';
  if(!w.creationType) w.creationType='work';
  if(!w.editorMode) w.editorMode='document';
  if(!Array.isArray(w.documentPages)||!w.documentPages.length) w.documentPages=[{id:'doc-'+(w.id||Date.now())+'-1',html:textToHtml(w.content||'')}];
  if(!Array.isArray(w.bookPages)||!w.bookPages.length){
    w.bookPages=[
      {id:'cover-'+(w.id||Date.now()),type:'cover',title:w.title||'',subtitle:'',image:w.cover||''},
      {id:'title-'+(w.id||Date.now()),type:'title',title:w.title||'',author:w.author||'',subtitle:'',year:String(new Date().getFullYear())},
      {id:'page-'+(w.id||Date.now())+'-1',type:'content',html:textToHtml(w.content||'')}
    ];
  }
  w.bookPages=w.bookPages.map((p,i)=>({...p,canvas:canvasForLegacyPage(p,w,i)}));
  if(!Array.isArray(w.mediaLibrary)) w.mediaLibrary=[];
  if(w.evaluationStatus==='open') w.status='evaluation';
  else w.status=w.publicationStatus==='published'?'published':'draft';
  return w;
}

function baseState(){
  return {
    user:null,
    cloud:{serverOnline:false,connected:false,lastSync:null,error:null},
    migrations:{},
    works:structuredClone(seedWorks).map(normalizeWork),
    posts:structuredClone(seedPosts),
    postComments:structuredClone(seedPostComments),
    reviews:[
      {id:'r-seed1',workId:'w-artificial',version:'1.0',scope:'evaluation',authorId:'seed-reader',author:'Анонимный читатель',anonymous:true,rating:4,comment:'Атмосфера работает отлично, но переход к дому номер семь кажется слишком резким. Хотелось бы чуть больше внутренней мотивации героя.',categories:{Сюжет:4,Персонажи:3,Стиль:4,Атмосфера:5,Темп:3},annotations:[{type:'pace',label:'Провисает темп',quote:'Ещё утром он поклялся себе никогда сюда не возвращаться.',comment:'Нужна связка с предыдущим решением.'}],reactions:{helpful:7,disagree:2,unhelpful:0},createdAt:'2026-09-12'},
      {id:'r-seed2',workId:'w-artificial',version:'1.0',scope:'evaluation',authorId:'seed-reader2',author:'MiraK',anonymous:false,rating:5,comment:'Очень понравились часы в финале фрагмента. Это хороший крючок. Я бы не объяснял их сразу.',categories:{Сюжет:5,Персонажи:4,Стиль:5,Атмосфера:5,Темп:4},annotations:[{type:'love',label:'Очень понравилось',quote:'Стрелки двигались назад.',comment:'Сильный финальный образ.'}],reactions:{helpful:11,disagree:1,unhelpful:0},createdAt:'2026-09-13'}
    ],
    library:{later:[],reading:[],completed:[]},
    readingProgress:{},
    annotations:{},
    communities:structuredClone(seedCommunities),
    joinedCommunities:[],
    messages:[{id:'m1',from:'Mara Chen',text:'Я загрузила первый вариант иллюстрации.',time:'12:27'},{id:'m2',from:'Elara Vance',text:'Посмотрите, пожалуйста, ритм второй сцены.',time:'14:10'}],
    peopleDirectory:structuredClone(seedPeople),
    friends:['p-elara','p-mara','p-kai'],
    chatThreads:[
      {id:'dm-elara',type:'dm',title:'Elara Vance',memberIds:['p-elara'],messages:[{id:'dm1',from:'Elara Vance',text:'Если дочитаешь главу — скажи, как тебе темп второй сцены.',time:'18:12'}]},
      {id:'dm-mara',type:'dm',title:'Mara Chen',memberIds:['p-mara'],messages:[{id:'dm2',from:'Mara Chen',text:'Скину новый эскиз обложки вечером.',time:'17:48'}]},
      {id:'grp-artificial',type:'group',title:'Искусственная судьба — команда',memberIds:['p-mara','p-james','p-kai'],ownerRole:'author',messages:[{id:'g1',from:'Mara Chen',text:'Я загрузила первый вариант иллюстрации.',time:'12:27'},{id:'g2',from:'James Ellington',text:'Отметил два места по ритму первой главы.',time:'14:10'}]}
    ],
    callHistory:[],
    activeCall:null,
    notifications:[
      {id:'local-welcome',kind:'system',title:'Добро пожаловать во FRAKTUM',body:'Заполните профиль и выберите интересы — так рекомендации станут точнее.',created_at:new Date().toISOString(),read_at:null}
    ],
    moderationReports:[],
    verificationRequests:[],
    privateNotes:'',
    ui:{
      page:'home',sidebarOpen:false,profileTab:'posts',selectedWorkId:null,selectedCommunityId:null,selectedStudioWorkId:null,
      modal:null,toast:null,selectedQuote:'',chatPanelOpen:false,chatTab:'chats',selectedChatId:'dm-elara',evaluationWorkId:null,
      evaluationFilters:{genres:[],kinds:[],length:'any'},
      readFilters:{query:'',genre:'',length:''},
      createDraftType:null,bookPageIndex:0,bookViewMode:false,bookSpreadIndex:0,readerBookIndex:0,studioGrid:false,canvasSelectedObjectId:null
    }
  };
}

export function loadState(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw) return baseState();
    const saved=JSON.parse(raw);
    const base=baseState();
    const posts=Array.isArray(saved.posts)?structuredClone(saved.posts):[];
    for(const seed of seedPosts) if(!posts.some(p=>p.id===seed.id)) posts.push(structuredClone(seed));
    const postComments=Array.isArray(saved.postComments)?structuredClone(saved.postComments):[];
    for(const c of postComments) if(c.myReaction===undefined)c.myReaction=null;
    for(const seed of seedPostComments){
      const existing=postComments.find(c=>c.id===seed.id);
      if(!existing)postComments.push(structuredClone(seed));
      else if(!saved.migrations?.singleReactionV12){existing.reactions=structuredClone(seed.reactions);existing.myReaction=null;}
    }
    const works=(Array.isArray(saved.works)?saved.works:base.works).map(normalizeWork);
    return {
      ...base,
      ...saved,
      works,
      posts,
      postComments,
      ui:{
        ...base.ui,
        ...saved.ui,
        evaluationFilters:{...base.ui.evaluationFilters,...saved.ui?.evaluationFilters},
        readFilters:{...base.ui.readFilters,...saved.ui?.readFilters}
      },
      library:{...base.library,...saved.library},
      readingProgress:{...base.readingProgress,...saved.readingProgress},
      migrations:{...base.migrations,...saved.migrations,singleReactionV12:true}
    };
  }catch{ return baseState(); }
}

export let state=loadState();

export function save(){
  const copy=structuredClone(state);
  copy.ui.modal=null; copy.ui.toast=null; copy.ui.selectedQuote='';
  localStorage.setItem(KEY,JSON.stringify(copy));
}

export function update(mutator,{persist=true}={}){
  mutator(state);
  if(persist) save();
}

export function reset(){
  state=baseState();
  save();
}

export function xpToLevel(xp){ return Math.max(1,Math.floor((xp||0)/200)+1); }
export function reviewerRank(rep){
  if(rep>=250) return 'Топ-рецензент';
  if(rep>=120) return 'Опытный критик';
  if(rep>=40) return 'Активный рецензент';
  return 'Начинающий читатель';
}
