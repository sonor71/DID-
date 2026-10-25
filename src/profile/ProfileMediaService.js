const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MEDIA_KINDS={avatar:{bucket:'lit-avatars',column:'avatar_path'},banner:{bucket:'lit-profile-banners',column:'banner_path'}};
export function profileMediaKind(kind){
  if(!Object.hasOwn(MEDIA_KINDS,kind))throw new TypeError('Неизвестный тип изображения профиля');
  return MEDIA_KINDS[kind];
}
/** Explicit null from the server means removed, never resurrect the cached image. */
export function profileMediaState(profile,fallback={},resolveUrl){
  const result={};
  for(const kind of ['avatar','banner']){
    const {bucket,column}=profileMediaKind(kind);
    const path=Object.hasOwn(profile||{},column)?profile[column]||'':fallback[`${kind}Path`]||'';
    result[`${kind}Path`]=path;
    result[`${kind}Url`]=path?resolveUrl(bucket,path):Object.hasOwn(profile||{},column)?'':fallback[`${kind}Url`]||'';
  }
  return result;
}
export function attachProfileImageErrors(root){
  root.addEventListener('error',event=>{
    const image=event.target;
    if(!image.matches?.('[data-profile-image],[data-profile-preview]'))return;
    image.hidden=true;
    if(image.nextElementSibling?.matches('.profile-image-error'))return;
    const message=document.createElement('span');message.className='profile-image-error';message.setAttribute('role','status');
    message.textContent='Изображение недоступно. Загрузите его повторно в настройках профиля.';
    image.insertAdjacentElement('afterend',message);
  },true);
  root.addEventListener('load',event=>{
    const image=event.target;
    if(!image.matches?.('[data-profile-image],[data-profile-preview]'))return;
    image.hidden=false;
    if(image.nextElementSibling?.matches('.profile-image-error'))image.nextElementSibling.remove();
  },true);
}
export function validateProfileImage(file,maxBytes=8_000_000){
  if(!file||!TYPES.has(file.type))throw new TypeError('Выберите JPEG, PNG или WebP');
  if(file.size<=0||file.size>maxBytes)throw new TypeError('Изображение должно быть меньше 8 МБ');
  return file;
}
export async function cropProfileImage(file,{aspect=1,width=512,height=Math.round(512/aspect)}={}){
  validateProfileImage(file);const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.decoding='async';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new TypeError('Файл не является изображением'));image.src=url;});
    const sourceAspect=image.naturalWidth/image.naturalHeight;let sw=image.naturalWidth,sh=image.naturalHeight,sx=0,sy=0;
    if(sourceAspect>aspect){sw=sh*aspect;sx=(image.naturalWidth-sw)/2;}else{sh=sw/aspect;sy=(image.naturalHeight-sh)/2;}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('Canvas недоступен');
    context.drawImage(image,sx,sy,sw,sh,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob)throw new Error('Не удалось подготовить изображение');
    return new File([blob],`${crypto.randomUUID()}.webp`,{type:'image/webp'});
  }finally{URL.revokeObjectURL(url);}
}
