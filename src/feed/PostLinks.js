const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cloudPostId(value){
  const id=String(value||'').replace(/^cloud:/,'');
  if(!UUID.test(id))throw new TypeError('Некорректная ссылка на пост');
  return id.toLowerCase();
}

export function postPermalink(post,origin){
  if(!post?.cloud)throw new TypeError('Поделиться можно только опубликованным серверным постом');
  return new URL(`/post/${cloudPostId(post.cloudId||post.id)}`,origin).href;
}

export async function sharePost(post,{navigator,origin}){
  const url=postPermalink(post,origin);
  if(typeof navigator.share==='function'){
    try{await navigator.share({title:'Пост во FRAKTUM',url});return 'shared';}
    catch(error){if(error?.name==='AbortError')return 'cancelled';throw error;}
  }
  if(typeof navigator.clipboard?.writeText!=='function')throw new Error('Браузер не разрешает копирование ссылки. Откройте страницу по HTTPS.');
  await navigator.clipboard.writeText(url);
  return 'copied';
}
