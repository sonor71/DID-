import {cloudPostId} from '../feed/PostLinks.js';

const PAGES=new Set(['home','evaluate','evaluation','read','work','reader','library','create','notes','communities','community','messages','profile','analytics','admin','feedback']);

export function parseRoute(input){
  const url=new URL(input,'https://fraktum.invalid');
  const path=url.pathname.replace(/\/$/,'');
  if(path.startsWith('/post/'))return {page:'post',postId:cloudPostId(path.slice(6))};
  const page=path.slice(1)||'home';
  const route={page:PAGES.has(page)?page:'home'};
  for(const key of ['work','community'])if(url.searchParams.get(key))route[key]=url.searchParams.get(key);
  return route;
}

export function routePath(route){
  if(route.page==='post')return `/post/${cloudPostId(route.postId)}`;
  const page=PAGES.has(route.page)?route.page:'home';
  const query=new globalThis.URLSearchParams();
  for(const key of ['work','community'])if(route[key])query.set(key,route[key]);
  return `/${page}${query.size?'?'+query:''}`;
}

/** Transitions affect page navigation only; ordinary renders remain immediate. */
export function createNavigationTransition({document,window,onError}){
  let active=null;
  let generation=0;
  return commit=>{
    const current=++generation;
    active?.skipTransition?.();
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let committed=false;
    const once=()=>{if(!committed&&current===generation){committed=true;commit();}};
    const fallback=()=>{
      once();
      if(!reduced){const page=document.querySelector('.page');page?.classList.add('navigation-enter');page?.addEventListener('animationend',()=>page.classList.remove('navigation-enter'),{once:true});}
    };
    if(reduced||typeof document.startViewTransition!=='function'){fallback();return;}
    try{
      active=document.startViewTransition(once);
      // Skipping an obsolete transition rejects ready, but its update still runs.
      active.ready.catch(()=>{});
      active.updateCallbackDone.catch(onError);
      active.finished.catch(()=>{});
    }catch(error){fallback();onError(error);}
  };
}
