const SUPABASE_URL='https://bvnbqjhgnlvthkluddfj.supabase.co';
const SUPABASE_KEY='sb_publishable_s2R7vW5VSbr86iCWYnRAgA_hgAvpscz';
const SESSION_KEY='d20-supabase-session-v1';

let session=loadSession();

function loadSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}
}
function saveSession(next){session=next||null;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);return session;}
function authHeaders(json=true){
  const h={apikey:SUPABASE_KEY};
  if(session?.access_token)h.Authorization=`Bearer ${session.access_token}`;
  if(json)h['Content-Type']='application/json';
  return h;
}
async function parse(res){
  const text=await res.text();let data=null;
  try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`HTTP ${res.status}`);
  return data;
}
async function refreshSession(){
  if(!session?.refresh_token)return null;
  const res=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  const data=await parse(res);return saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});
}
export async function ensureSession(){
  if(!session)return null;
  if(session.expires_at && session.expires_at < Math.floor(Date.now()/1000)+60){
    try{await refreshSession();}catch{saveSession(null);}
  }
  return session;
}
export function getSession(){return session;}
export function isCloudAuthenticated(){return !!session?.access_token;}

export async function signOut(){
  if(session?.access_token){await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:authHeaders(false)}).catch(()=>{});}saveSession(null);
}

export async function requestOtp({method,identifier,createUser=false,metadata={}}){
  const key=method==='phone'?'phone':'email';
  const body={[key]:identifier,create_user:!!createUser};
  if(createUser&&metadata&&Object.keys(metadata).length)body.data=metadata;
  if(method==='phone')body.channel='sms';
  const res=await fetch(`${SUPABASE_URL}/auth/v1/otp`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return parse(res);
}

export async function verifyOtp({method,identifier,token}){
  const body={type:method==='phone'?'sms':'email',token:String(token||'').trim()};
  if(method==='phone')body.phone=identifier;else body.email=identifier;
  const res=await fetch(`${SUPABASE_URL}/auth/v1/verify`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await parse(res);
  if(data?.access_token)saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});
  return data;
}

export async function checkServerConnection(){
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/lit_profiles?select=id&limit=1`,{headers:{apikey:SUPABASE_KEY}});
    if(!res.ok)return false;
    await res.text();
    return true;
  }catch{return false;}
}

export async function rest(path,{method='GET',body,headers={}}={}){
  await ensureSession();
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{...authHeaders(body!==undefined),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return parse(res);
}
export async function rpc(name,body={}){
  return rest(`rpc/${name}`,{method:'POST',body,headers:{Prefer:'return=representation'}});
}
export async function getMyProfile(){
  await ensureSession(); if(!session?.user?.id)return null;
  const rows=await rest(`lit_profiles?id=eq.${session.user.id}&select=*`);return rows?.[0]||null;
}
export async function createMyProfile({username,nickname='',firstName='',lastName='',role='reader'}={}){
  await ensureSession(); if(!session?.user?.id)throw new Error('Нет облачной сессии');
  const cleanUsername=String(username||'').trim().replace(/^@/,'');
  if(!cleanUsername)throw new Error('Username обязателен');
  const rows=await rest('lit_profiles',{method:'POST',body:{
    id:session.user.id,
    username:cleanUsername,
    nickname:String(nickname||'').trim(),
    first_name:String(firstName||'').trim(),
    last_name:String(lastName||'').trim(),
    account_role:role==='author'?'author':'reader',
    author_verified:false,
    xp:0,
    reviewer_reputation:0
  },headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function updateMyProfile(patch){
  await ensureSession(); if(!session?.user?.id)throw new Error('Нет облачной сессии');
  const rows=await rest(`lit_profiles?id=eq.${session.user.id}`,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});return rows?.[0]||null;
}

const inFilter=ids=>ids.map(x=>`\"${String(x).replaceAll('"','')}\"`).join(',');
export function publicObjectUrl(bucket,path){return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${String(path).split('/').map(encodeURIComponent).join('/')}`;}
export async function uploadPublicMedia(bucket,path,file){
  await ensureSession(); if(!session?.access_token)throw new Error('Войдите в аккаунт');
  const res=await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
  await parse(res);return publicObjectUrl(bucket,path);
}

export async function fetchPublicFeed(){
  const posts=await rest('lit_posts?visibility=eq.public&select=id,author_id,post_type,body,work_id,version_id,created_at&order=created_at.desc&limit=50');
  if(!posts?.length)return [];
  const postIds=posts.map(p=>p.id);const authorIds=[...new Set(posts.map(p=>p.author_id))];
  const [profiles,media,likes,comments]=await Promise.all([
    rest(`lit_profiles?id=in.(${inFilter(authorIds)})&select=id,username,nickname,avatar_path,account_role,author_verified`),
    rest(`lit_post_media?post_id=in.(${inFilter(postIds)})&select=*&order=sort_order.asc`),
    rest(`lit_post_reactions?post_id=in.(${inFilter(postIds)})&select=post_id,user_id,reaction`),
    rest(`lit_comments?post_id=in.(${inFilter(postIds)})&select=id,post_id`)
  ]);
  const profileMap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  return posts.map(p=>{
    const prof=profileMap[p.author_id]||{};
    const pm=(media||[]).filter(m=>m.post_id===p.id).map(m=>({...m,url:publicObjectUrl('lit-post-media',m.storage_path)}));
    return {id:`cloud:${p.id}`,cloudId:p.id,cloud:true,authorId:p.author_id,author:prof.nickname||prof.username||'Пользователь',username:prof.username||'',avatar:prof.avatar_path?publicObjectUrl('lit-avatars',prof.avatar_path):'',role:prof.account_role==='author'?'Автор':'Читатель',text:p.body||'',postType:p.post_type,workId:p.work_id||null,media:pm,likes:(likes||[]).filter(x=>x.post_id===p.id).length,comments:(comments||[]).filter(x=>x.post_id===p.id).length,createdAt:p.created_at};
  });
}

export async function createCloudPost({text,files=[]}){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите в аккаунт');
  const inserted=await rest('lit_posts',{method:'POST',body:{author_id:session.user.id,post_type:files.length?'media':'text',body:text,visibility:'public'},headers:{Prefer:'return=representation'}});
  const post=inserted?.[0];if(!post)throw new Error('Не удалось создать пост');
  let order=0;
  for(const file of files){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path=`${session.user.id}/${post.id}/${Date.now()}-${order}-${safe}`;
    await uploadPublicMedia('lit-post-media',path,file);
    await rest('lit_post_media',{method:'POST',body:{post_id:post.id,media_type:file.type.startsWith('video/')?'video':'image',storage_path:path,sort_order:order,alt_text:file.name}});
    order++;
  }
  return post;
}
export async function toggleCloudPostLike(postId){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите');
  const existing=await rest(`lit_post_reactions?post_id=eq.${postId}&user_id=eq.${session.user.id}&select=post_id`);
  if(existing?.length)await rest(`lit_post_reactions?post_id=eq.${postId}&user_id=eq.${session.user.id}`,{method:'DELETE'});
  else await rest('lit_post_reactions',{method:'POST',body:{post_id:postId,user_id:session.user.id,reaction:'like'}});
}
export async function fetchPostComments(postId){
  const comments=await rest(`lit_comments?post_id=eq.${postId}&select=id,author_id,body,created_at&order=created_at.asc`);
  if(!comments?.length)return [];
  const ids=[...new Set(comments.map(c=>c.author_id))];
  const [profiles,reactions]=await Promise.all([
    rest(`lit_profiles?id=in.(${inFilter(ids)})&select=id,nickname,username,avatar_path`),
    rest(`lit_comment_reactions?comment_id=in.(${inFilter(comments.map(c=>c.id))})&select=comment_id,user_id,reaction`)
  ]);
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  return comments.map(c=>{const p=pm[c.author_id]||{};const rs=(reactions||[]).filter(r=>r.comment_id===c.id);const mine=rs.find(r=>r.user_id===session?.user?.id)?.reaction||null;return {id:c.id,cloud:true,author:p.nickname||p.username||'Пользователь',text:c.body,createdAt:c.created_at,time:new Date(c.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),myReaction:mine,reactions:{helpful:rs.filter(r=>r.reaction==='helpful').length,disagree:rs.filter(r=>r.reaction==='disagree').length,unhelpful:rs.filter(r=>r.reaction==='unhelpful').length}};});
}
export async function createCloudComment(postId,text){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите');
  return rest('lit_comments',{method:'POST',body:{author_id:session.user.id,post_id:postId,body:text},headers:{Prefer:'return=representation'}});
}
export async function setCloudCommentReaction(commentId,reaction){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите');
  const userId=session.user.id;
  const current=await rest(`lit_comment_reactions?comment_id=eq.${commentId}&user_id=eq.${userId}&select=reaction`);
  const previous=current?.[0]?.reaction||null;
  if(previous===reaction){
    await rest(`lit_comment_reactions?comment_id=eq.${commentId}&user_id=eq.${userId}`,{method:'DELETE'});
    return {reaction:null};
  }
  if(previous){
    await rest(`lit_comment_reactions?comment_id=eq.${commentId}&user_id=eq.${userId}`,{method:'PATCH',body:{reaction},headers:{Prefer:'return=minimal'}});
  }else{
    await rest('lit_comment_reactions',{method:'POST',body:{comment_id:commentId,user_id:userId,reaction},headers:{Prefer:'return=minimal'}});
  }
  return {reaction};
}


// ---- Literature notifications, moderation and closed-beta administration ----
export async function fetchNotifications(limit=40){
  await ensureSession();const me=session?.user?.id;if(!me)return [];
  const rows=await rest(`lit_notifications?user_id=eq.${me}&select=id,user_id,actor_id,kind,title,body,entity_type,entity_id,created_at,read_at&order=created_at.desc&limit=${Number(limit)||40}`);
  return rows||[];
}
export async function markNotificationRead(id){
  await ensureSession();const me=session?.user?.id;if(!me)return;
  return rest(`lit_notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${me}`,{method:'PATCH',body:{read_at:new Date().toISOString()},headers:{Prefer:'return=minimal'}});
}
export async function markAllNotificationsRead(){
  await ensureSession();const me=session?.user?.id;if(!me)return;
  return rest(`lit_notifications?user_id=eq.${me}&read_at=is.null`,{method:'PATCH',body:{read_at:new Date().toISOString()},headers:{Prefer:'return=minimal'}});
}
export async function createReport({targetType,targetId,reason,details=''}){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const rows=await rest('lit_reports',{method:'POST',body:{reporter_id:me,target_type:String(targetType||'content'),target_id:String(targetId||''),reason:String(reason||'Другое'),details:String(details||'')},headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function fetchModerationReports(){
  await ensureSession();
  return rest('lit_reports?select=*&order=created_at.desc&limit=100');
}
export async function setModerationReportStatus(id,status){
  await ensureSession();
  const patch={status};if(['resolved','dismissed'].includes(status))patch.resolved_at=new Date().toISOString();
  return rest(`lit_reports?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});
}
export async function requestAuthorVerification(note=''){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const rows=await rest('lit_author_verification_requests',{method:'POST',body:{user_id:me,note:String(note||'')},headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function fetchMyVerificationRequests(){
  await ensureSession();const me=session?.user?.id;if(!me)return [];
  return rest(`lit_author_verification_requests?user_id=eq.${me}&select=*&order=created_at.desc&limit=10`);
}
export async function fetchVerificationRequests(){
  await ensureSession();
  return rest('lit_author_verification_requests?select=*&order=created_at.desc&limit=100');
}
export async function resolveAuthorVerification(id,status){
  const rows=await rpc('lit_resolve_author_verification',{p_request:id,p_status:status});
  return Array.isArray(rows)?rows[0]:rows;
}


// ---- Cloud literature core: works, versions, reviews and reading progress ----
const kindToDb=(kind)=>({Роман:'novel',Повесть:'novella',Рассказ:'story',Стихотворение:'poem',Фрагмент:'other'}[kind]||'other');
const kindFromDb=(kind)=>({novel:'Роман',novella:'Повесть',story:'Рассказ',poem:'Стихотворение',other:'Другое'}[kind]||'Другое');

export async function fetchCloudLiterature(){
  await ensureSession();const me=session?.user?.id;if(!me)return {works:[],reviews:[]};
  const works=await rest('lit_works?select=*&order=updated_at.desc&limit=200');
  if(!works?.length)return {works:[],reviews:[]};
  const workIds=works.map(w=>w.id);
  const [versions,profiles,reviews]=await Promise.all([
    rest(`lit_work_versions?work_id=in.(${inFilter(workIds)})&select=*&order=version_no.desc`),
    rest(`lit_profiles?id=in.(${inFilter([...new Set(works.map(w=>w.author_id))])})&select=id,username,nickname,avatar_path,account_role,author_verified`),
    rest(`lit_reviews?work_id=in.(${inFilter(workIds)})&select=*&order=created_at.desc`)
  ]);
  const reviewerIds=[...new Set((reviews||[]).map(r=>r.reviewer_id))];
  const [reviewers,reactions]=await Promise.all([
    reviewerIds.length?rest(`lit_profiles?id=in.(${inFilter(reviewerIds)})&select=id,username,nickname,avatar_path`):Promise.resolve([]),
    reviews?.length?rest(`lit_review_reactions?review_id=in.(${inFilter(reviews.map(r=>r.id))})&select=review_id,user_id,reaction`):Promise.resolve([])
  ]);
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  const rpm=Object.fromEntries((reviewers||[]).map(p=>[p.id,p]));
  const versionById=Object.fromEntries((versions||[]).map(v=>[v.id,v]));
  const uiWorks=[];
  const uiIdByCloud={};
  for(const w of works){
    const vs=(versions||[]).filter(v=>v.work_id===w.id).sort((a,b)=>b.version_no-a.version_no);
    let v;
    if(w.author_id===me)v=vs[0];
    else v=vs.find(x=>x.published_at)||vs.find(x=>x.evaluation_open);
    if(!v)continue;
    const prof=pm[w.author_id]||{};
    const meta=v.evaluation_meta||{};const content=v.content||{};
    const id=`cloud:${w.id}`;uiIdByCloud[w.id]=id;
    uiWorks.push({
      id,cloud:true,cloudId:w.id,cloudVersionId:v.id,authorId:w.author_id,author:prof.nickname||prof.username||'Автор',
      title:w.title,summary:w.summary||'',kind:kindFromDb(w.kind),genres:w.genres||[],tags:w.topics||[],cover:w.cover_path||'/assets/home/reading-cover.png',
      version:String(v.version_no),rating:0,ratingsCount:0,authorActivity:50,createdAt:w.created_at,minutes:Math.max(1,Math.ceil(String(v.plain_text||'').length/900)),
      publicationStatus:w.status==='published'&&!!v.published_at?'published':'draft',evaluationStatus:v.evaluation_open?'open':'closed',status:v.evaluation_open?'evaluation':(w.status==='published'&&v.published_at?'published':'draft'),
      targetType:meta.targetType||'Фрагмент',evaluationTarget:meta.evaluationTarget||'Фрагмент',evaluationText:v.evaluation_excerpt||'',feedbackWanted:meta.feedbackWanted||[],content:v.plain_text||'',
      creationType:content.creationType||'work',editorMode:content.editorMode||'document',documentPages:content.documentPages||[],bookPages:content.bookPages||[],mediaLibrary:content.mediaLibrary||[],contentRating:w.content_rating||'general',topics:w.topics||[]
    });
  }
  const uiReviews=(reviews||[]).map(r=>{
    const rp=rpm[r.reviewer_id]||{};const vr=versionById[r.version_id];const rs=(reactions||[]).filter(x=>x.review_id===r.id);
    return {id:`cloud-review:${r.id}`,cloud:true,cloudId:r.id,workId:uiIdByCloud[r.work_id]||`cloud:${r.work_id}`,version:String(vr?.version_no||''),scope:r.scope,authorId:r.reviewer_id,author:rp.nickname||rp.username||'Читатель',anonymous:!!r.anonymous,rating:Number(r.rating||0),comment:r.body||'',categories:r.category_ratings||{},annotations:r.annotations||[],reactions:{helpful:rs.filter(x=>x.reaction==='helpful').length,disagree:rs.filter(x=>x.reaction==='disagree').length,unhelpful:rs.filter(x=>x.reaction==='unhelpful').length},myReaction:rs.find(x=>x.user_id===me)?.reaction||null,createdAt:r.created_at};
  });
  for(const w of uiWorks){const rs=uiReviews.filter(r=>r.workId===w.id&&r.scope==='full');if(rs.length){w.rating=rs.reduce((a,r)=>a+r.rating,0)/rs.length;w.ratingsCount=rs.length;}}
  return {works:uiWorks,reviews:uiReviews};
}

export async function saveCloudWork(local,{mode='draft'}={}){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  let workId=local.cloudId||null;
  const published=mode==='published'||local.publicationStatus==='published';
  const workPayload={title:local.title||'Без названия',summary:local.summary||'',kind:kindToDb(local.kind),status:published?'published':'draft',genres:local.genres||[],topics:local.topics||[],content_rating:local.contentRating||'general'};
  let work;
  if(workId){
    const rows=await rest(`lit_works?id=eq.${workId}`,{method:'PATCH',body:{...workPayload,...(published?{published_at:local.publishedAt||new Date().toISOString()}:{})},headers:{Prefer:'return=representation'}});work=rows?.[0];
  }else{
    const rows=await rest('lit_works',{method:'POST',body:{author_id:me,...workPayload,...(published?{published_at:new Date().toISOString()}:{})},headers:{Prefer:'return=representation'}});work=rows?.[0];workId=work?.id;
  }
  if(!workId)throw new Error('Не удалось сохранить произведение');
  const content={creationType:local.creationType||'work',editorMode:local.editorMode||'document',documentPages:local.documentPages||[],bookPages:local.bookPages||[],mediaLibrary:local.mediaLibrary||[],localVersion:local.version||'1'};
  const versionPayload={title:local.title||'Без названия',content,plain_text:local.content||'',evaluation_open:mode==='evaluation'||local.evaluationStatus==='open',evaluation_excerpt:local.evaluationText||'',evaluation_meta:{targetType:local.targetType||'Фрагмент',evaluationTarget:local.evaluationTarget||'Фрагмент',feedbackWanted:local.feedbackWanted||[]},...(published?{published_at:local.publishedAt||new Date().toISOString()}:{})};
  let version;
  if(local.cloudVersionId){
    const rows=await rest(`lit_work_versions?id=eq.${local.cloudVersionId}`,{method:'PATCH',body:versionPayload,headers:{Prefer:'return=representation'}});version=rows?.[0];
  }else{
    const existing=await rest(`lit_work_versions?work_id=eq.${workId}&select=id,version_no&order=version_no.desc&limit=1`);const next=(existing?.[0]?.version_no||0)+1;
    const rows=await rest('lit_work_versions',{method:'POST',body:{work_id:workId,created_by:me,version_no:next,...versionPayload},headers:{Prefer:'return=representation'}});version=rows?.[0];
  }
  if(!version)throw new Error('Не удалось сохранить версию');
  return {work,version};
}

export async function saveCloudReview({work,review}){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  if(!work?.cloudId||!work?.cloudVersionId)return null;
  const payload={reviewer_id:me,work_id:work.cloudId,version_id:work.cloudVersionId,scope:review.scope||'evaluation',anonymous:!!review.anonymous,rating:Number(review.rating||0),category_ratings:review.categories||{},body:review.comment||'',annotations:review.annotations||[],updated_at:new Date().toISOString()};
  let existing;
  if(review.cloudId)existing=[{id:review.cloudId}];
  else existing=await rest(`lit_reviews?reviewer_id=eq.${me}&work_id=eq.${work.cloudId}&version_id=eq.${work.cloudVersionId}&scope=eq.${encodeURIComponent(review.scope||'evaluation')}&select=id&limit=1`);
  if(existing?.[0]?.id){const rows=await rest(`lit_reviews?id=eq.${existing[0].id}`,{method:'PATCH',body:payload,headers:{Prefer:'return=representation'}});return rows?.[0]||null;}
  const rows=await rest('lit_reviews',{method:'POST',body:payload,headers:{Prefer:'return=representation'}});return rows?.[0]||null;
}

export async function setCloudReviewReaction(reviewId,reaction){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const current=await rest(`lit_review_reactions?review_id=eq.${reviewId}&user_id=eq.${me}&select=reaction`);const previous=current?.[0]?.reaction||null;
  if(previous===reaction){await rest(`lit_review_reactions?review_id=eq.${reviewId}&user_id=eq.${me}`,{method:'DELETE'});return null;}
  if(previous)await rest(`lit_review_reactions?review_id=eq.${reviewId}&user_id=eq.${me}`,{method:'PATCH',body:{reaction},headers:{Prefer:'return=minimal'}});
  else await rest('lit_review_reactions',{method:'POST',body:{review_id:reviewId,user_id:me,reaction},headers:{Prefer:'return=minimal'}});
  return reaction;
}

export async function saveCloudReadingProgress(work,{progress=0,status='reading'}={}){
  await ensureSession();const me=session?.user?.id;if(!me||!work?.cloudId)return;
  const row={user_id:me,work_id:work.cloudId,version_id:work.cloudVersionId||null,status,progress:Math.max(0,Math.min(100,Number(progress)||0)),last_position:0,updated_at:new Date().toISOString()};
  return rest('lit_reading_progress?on_conflict=user_id,work_id',{method:'POST',body:row,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
}

// ---- Real user search, conversations and messages ----
export async function findProfileByUsername(username){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите');
  const q=encodeURIComponent(String(username||'').trim().replace(/^@/,'').replace(/[,*()]/g,''));
  if(!q)return null;
  const rows=await rest(`lit_profiles?username=ilike.${q}&select=id,username,nickname,avatar_path,account_role,author_verified&limit=1`);
  return rows?.[0]||null;
}
export async function getOrCreateDirectConversation(otherUserId){
  await ensureSession();if(!session?.user?.id)throw new Error('Сначала войдите');
  return rpc('lit_get_or_create_direct_conversation',{p_other:otherUserId});
}
export async function createCloudGroupConversation(title,memberIds=[],workId=null){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const rows=await rest('lit_conversations',{method:'POST',body:{conversation_type:'project',title,created_by:me,work_id:workId||null},headers:{Prefer:'return=representation'}});
  const c=rows?.[0];if(!c)throw new Error('Не удалось создать группу');
  const unique=[...new Set([me,...memberIds.filter(Boolean)])];
  await rest('lit_conversation_members',{method:'POST',body:unique.map(id=>({conversation_id:c.id,user_id:id,role:id===me?'owner':'member'}))});
  return c.id;
}
export async function fetchMyConversations(){
  await ensureSession();const me=session?.user?.id;if(!me)return {threads:[],people:[]};
  const own=await rest(`lit_conversation_members?user_id=eq.${me}&select=conversation_id,role`);
  const ids=[...new Set((own||[]).map(x=>x.conversation_id))];
  if(!ids.length)return {threads:[],people:[]};
  const [convs,members]=await Promise.all([
    rest(`lit_conversations?id=in.(${inFilter(ids)})&select=id,conversation_type,title,created_by,work_id,created_at&order=created_at.desc`),
    rest(`lit_conversation_members?conversation_id=in.(${inFilter(ids)})&select=conversation_id,user_id,role,joined_at`)
  ]);
  const userIds=[...new Set((members||[]).map(x=>x.user_id))];
  const profiles=userIds.length?await rest(`lit_profiles?id=in.(${inFilter(userIds)})&select=id,username,nickname,avatar_path,account_role,author_verified`):[];
  const pmap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  const threads=(convs||[]).map(c=>{
    const cm=(members||[]).filter(m=>m.conversation_id===c.id);
    const others=cm.filter(m=>m.user_id!==me).map(m=>pmap[m.user_id]).filter(Boolean);
    const direct=c.conversation_type==='direct';
    const title=direct?(others[0]?.nickname||others[0]?.username||'Пользователь'):(c.title||'Группа');
    return {id:c.id,cloud:true,type:direct?'dm':'group',title,memberIds:others.map(p=>p.id),members:others.map(p=>({id:p.id,name:p.nickname||p.username,username:p.username,avatar:p.avatar_path?publicObjectUrl('lit-avatars',p.avatar_path):'',role:p.account_role,online:null})),messages:[],callsEnabled:direct};
  });
  const people=(profiles||[]).filter(p=>p.id!==me).map(p=>({id:p.id,name:p.nickname||p.username,username:p.username,avatar:p.avatar_path?publicObjectUrl('lit-avatars',p.avatar_path):'',role:p.account_role,online:null}));
  return {threads,people};
}
export async function fetchConversationMessages(conversationId){
  await ensureSession();const me=session?.user?.id;if(!me)return [];
  const rows=await rest(`lit_messages?conversation_id=eq.${conversationId}&select=id,sender_id,body,created_at,edited_at&order=created_at.asc&limit=250`);
  if(!rows?.length)return [];
  const ids=[...new Set(rows.map(x=>x.sender_id))];
  const profiles=await rest(`lit_profiles?id=in.(${inFilter(ids)})&select=id,nickname,username`);
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  return rows.map(m=>({id:m.id,fromId:m.sender_id,from:pm[m.sender_id]?.nickname||pm[m.sender_id]?.username||'Пользователь',text:m.body,time:new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),createdAt:m.created_at,mine:m.sender_id===me}));
}
export async function sendCloudMessage(conversationId,text){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  return rest('lit_messages',{method:'POST',body:{conversation_id:conversationId,sender_id:me,body:text},headers:{Prefer:'return=representation'}});
}

// ---- Real WebRTC call signaling persisted in Supabase ----
export async function getConversationPeer(conversationId){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const members=await rest(`lit_conversation_members?conversation_id=eq.${conversationId}&select=user_id`);
  const ids=(members||[]).map(x=>x.user_id).filter(id=>id!==me);
  if(ids.length!==1)throw new Error('В этой версии реальный звонок работает только один-на-один');
  const profiles=await rest(`lit_profiles?id=eq.${ids[0]}&select=id,username,nickname,avatar_path&limit=1`);
  return profiles?.[0]||{id:ids[0],username:'',nickname:'Пользователь'};
}
export async function createCloudCall(conversationId,mode='audio'){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  const rows=await rest('lit_calls',{method:'POST',body:{conversation_id:conversationId,started_by:me,mode:mode==='video'?'video':'audio',status:'ringing'},headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function fetchIncomingCalls(){
  await ensureSession();const me=session?.user?.id;if(!me)return [];
  const rows=await rest(`lit_calls?status=eq.ringing&started_by=neq.${me}&select=id,conversation_id,started_by,mode,status,created_at&order=created_at.desc&limit=5`);
  if(!rows?.length)return [];
  const starters=[...new Set(rows.map(x=>x.started_by))];
  const profiles=await rest(`lit_profiles?id=in.(${inFilter(starters)})&select=id,username,nickname,avatar_path`);
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  return rows.map(c=>({...c,caller:pm[c.started_by]||null}));
}
export async function getCloudCall(callId){
  const rows=await rest(`lit_calls?id=eq.${callId}&select=*&limit=1`);return rows?.[0]||null;
}
export async function setCloudCallStatus(callId,status){
  const patch={status};if(status==='active')patch.answered_at=new Date().toISOString();if(['ended','declined','missed'].includes(status))patch.ended_at=new Date().toISOString();
  const rows=await rest(`lit_calls?id=eq.${callId}`,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});return rows?.[0]||null;
}
export async function sendCloudCallSignal(callId,recipientId,signalType,payload={}){
  await ensureSession();const me=session?.user?.id;if(!me)throw new Error('Сначала войдите');
  return rest('lit_call_signals',{method:'POST',body:{call_id:callId,sender_id:me,recipient_id:recipientId,signal_type:signalType,payload},headers:{Prefer:'return=minimal'}});
}
export async function fetchCloudCallSignals(callId,afterId=0){
  await ensureSession();const me=session?.user?.id;if(!me)return [];
  return rest(`lit_call_signals?call_id=eq.${callId}&recipient_id=eq.${me}&id=gt.${Number(afterId)||0}&select=id,call_id,sender_id,recipient_id,signal_type,payload,created_at&order=id.asc`);
}
