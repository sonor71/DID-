import {permanentMediaUrl,assertWorkMediaReady} from './MediaModel.js';
import {assertPersistableDocument} from './Serialization.js';

/** Upload legacy embedded media before replacing any document references. */
export async function migrateEmbeddedWorkAssets(work,upload,{load=async source=>{
  const response=await fetch(source);if(!response.ok)throw new Error('Не удалось прочитать исходное изображение');
  const blob=await response.blob();return new File([blob],`legacy-${crypto.randomUUID()}.${blob.type==='image/png'?'png':'webp'}`,{type:blob.type});
}}={}){
  const sources=new Set();
  const scan=value=>{
    if(typeof value==='string'){
      if(/^(?:data|blob):/i.test(value))sources.add(value);
      for(const match of value.matchAll(/\b(?:src|href)\s*=\s*["']((?:data|blob):[^"']+)["']/gi))sources.add(match[1]);
    }else if(Array.isArray(value))value.forEach(scan);
    else if(value&&typeof value==='object')Object.values(value).forEach(scan);
  };
  scan(work);if(!sources.size)return false;
  const replacements=new Map();
  for(const source of sources){
    const file=await load(source);
    const asset=await upload(file);permanentMediaUrl(asset.url);
    replacements.set(source,asset);
  }
  // A failed upload leaves every original reference intact, so a retry cannot lose a draft.
  const next=structuredClone(work);
  const replace=value=>{
    if(typeof value==='string'){for(const [source,asset] of replacements)value=value.replaceAll(source,asset.url);return value;}
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==='object'){
      const original=value.src||value.url||value.image;
      const out=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
      const asset=replacements.get(original);if(asset)Object.assign(out,{assetId:asset.assetId,assetPath:asset.storagePath,storagePath:asset.storagePath});
      return out;
    }
    return value;
  };
  const migrated=replace(next);migrated.mediaLibrary??=[];
  for(const asset of replacements.values())if(!migrated.mediaLibrary.some(item=>item.storagePath===asset.storagePath))migrated.mediaLibrary.push(asset);
  assertPersistableDocument(migrated);assertWorkMediaReady(migrated);
  Object.assign(work,migrated);return true;
}
