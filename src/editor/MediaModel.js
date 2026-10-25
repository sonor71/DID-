export const PAGE_WIDTH=760;
export const PAGE_HEIGHT=1080;
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function permanentMediaUrl(value){
  const url=String(value||'').trim();
  if(/^(?:data|blob):/i.test(url))throw new TypeError('Изображение ещё не загружено в облако. Загрузите исходный файл перед сохранением.');
  if(url&&!/^(?:https?:\/\/|\/)/i.test(url))throw new TypeError('Недопустимый адрес изображения');
  return url;
}

/** One persisted image shape for books, documents, drafts and fragments. */
export function normalizeMediaObject(input,{pageId='',index=0,allowEmbedded=false}={}){
  const width=clamp(finite(input.width??input.w,280),60,PAGE_WIDTH);
  const height=clamp(finite(input.height??input.h,220),50,PAGE_HEIGHT);
  const source=String(input.url||input.src||'');
  if(!allowEmbedded)permanentMediaUrl(source);
  const zIndex=Math.max(1,finite(input.zIndex??input.z,index+1));
  const layoutMode=input.layoutMode==='flow'?'flow':'free';
  const wrapMode=['left','right','center','wide','none'].includes(input.wrapMode)?input.wrapMode:(input.wrap==='none'?'none':'left');
  return {...input,id:input.id||`media-${pageId}-${index}`,type:'image',pageId:input.pageId||pageId,
    assetId:input.assetId||'',assetPath:input.assetPath||input.storagePath||'',storagePath:input.storagePath||input.assetPath||'',
    url:source,src:source,x:clamp(finite(input.x,72),0,PAGE_WIDTH-width),y:clamp(finite(input.y,100),0,PAGE_HEIGHT-height),
    width,height,w:width,h:height,zIndex,z:zIndex,layoutMode,wrapMode,
    alt:String(input.alt||''),caption:String(input.caption||''),rotation:finite(input.rotation,0),
    fit:input.fit==='contain'?'contain':'cover',opacity:clamp(finite(input.opacity,1),0,1),gap:clamp(finite(input.gap,14),0,60),
    wrap:wrapMode==='none'?'none':'auto',locked:!!input.locked};
}

export function applyMediaLayout(input,layoutMode,wrapMode=input.wrapMode||'left'){
  const image=normalizeMediaObject({...input,layoutMode,wrapMode},{pageId:input.pageId});
  if(layoutMode==='flow'){
    image.width=image.w=wrapMode==='wide'?616:Math.min(image.width,616);
    image.height=image.h=Math.min(image.height,PAGE_HEIGHT-72);
    image.x=wrapMode==='right'?PAGE_WIDTH-72-image.width:wrapMode==='center'?(PAGE_WIDTH-image.width)/2:72;
    image.y=Math.max(72,Math.min(image.y,PAGE_HEIGHT-image.height));
  }
  return image;
}

/** Upgrade old figure HTML once; preserve unsupported embedded media for explicit upload migration. */
export function ensureStructuredPage(page,{document:dom=globalThis.document}={}){
  page.id=page.id||`page-${crypto.randomUUID()}`;
  if(!page.canvas){
    let html=page.html||'<p><br></p>';
    const images=[];
    if(dom){
      const template=dom.createElement('template');template.innerHTML=html;
      for(const img of [...template.content.querySelectorAll('img')]){
        const figure=img.closest('figure');
        const align=figure?.classList.contains('wrap-right')?'right':figure?.classList.contains('wrap-left')?'left':figure?.classList.contains('wrap-wide')?'wide':'center';
        const percent=parseFloat(figure?.style.width)||55;
        images.push(normalizeMediaObject({id:`legacy-${page.id}-${images.length}`,src:img.getAttribute('src')||'',alt:img.getAttribute('alt')||'',caption:figure?.querySelector('figcaption')?.textContent||'',layoutMode:'flow',wrapMode:align,x:72,y:100+images.length*240,w:616*percent/100,h:220},{pageId:page.id,index:images.length,allowEmbedded:true}));
        (figure||img).remove();
      }
      html=template.innerHTML||'<p><br></p>';
    }
    page.canvas={background:{color:'#f7f1e5',image:'',fit:'cover',position:'center'},textColor:'#191715',objects:[
      {id:`body-${page.id}`,type:'text',role:'body',x:72,y:72,w:616,h:936,z:1,rotation:0,html,flow:true,locked:false,style:{fontFamily:'Georgia',fontSize:18,lineHeight:1.55,color:null,align:'left',background:'transparent',padding:6}},...images
    ]};
  }
  if(dom){
    for(const text of [...(page.canvas.objects||[])].filter(object=>object.type==='text'&&/<img\b/i.test(object.html||''))){
      const template=dom.createElement('template');template.innerHTML=text.html;
      for(const img of [...template.content.querySelectorAll('img')]){
        const figure=img.closest('figure');const index=page.canvas.objects.length;
        const wrapMode=figure?.classList.contains('wrap-right')?'right':figure?.classList.contains('wrap-left')?'left':figure?.classList.contains('wrap-wide')?'wide':'center';
        page.canvas.objects.push(normalizeMediaObject({id:`legacy-${page.id}-${index}`,src:img.getAttribute('src')||'',alt:img.getAttribute('alt')||'',caption:figure?.querySelector('figcaption')?.textContent||'',layoutMode:'flow',wrapMode,x:text.x||72,y:(text.y||72)+Math.min(index*120,700),w:280,h:220},{pageId:page.id,index,allowEmbedded:true}));
        (figure||img).remove();
      }
      text.html=template.innerHTML||'<p><br></p>';
    }
  }
  page.canvas.objects=(page.canvas.objects||[]).map((object,index)=>object.type==='image'?normalizeMediaObject(object,{pageId:page.id,index,allowEmbedded:true}):object);
  return page;
}

export function assertWorkMediaReady(work){
  for(const page of [...(work.bookPages||[]),...(work.documentPages||[])]){
    if(page.canvas?.background?.image)permanentMediaUrl(page.canvas.background.image);
    for(const object of page.canvas?.objects||[]){
      if(object.type==='image')permanentMediaUrl(object.url||object.src);
      if(object.type==='text'&&/\b(?:src|href)\s*=\s*["']?\s*(?:data|blob):/i.test(object.html||''))throw new TypeError('В тексте осталось незагруженное изображение');
    }
  }
  for(const asset of work.mediaLibrary||[])permanentMediaUrl(asset.url||asset.src);
  return work;
}
