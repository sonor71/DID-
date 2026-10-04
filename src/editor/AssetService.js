const ALLOWED_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
export const MAX_ASSET_BYTES=12_000_000;

export class AssetValidationError extends Error {}

export function validateImageFile(file){
  if(!file)throw new AssetValidationError('Выберите изображение');
  if(!ALLOWED_TYPES.has(file.type))throw new AssetValidationError('Поддерживаются JPEG, PNG, WebP и GIF');
  if(file.size<=0||file.size>MAX_ASSET_BYTES)throw new AssetValidationError('Максимальный размер изображения — 12 МБ');
  return file;
}

export class AssetService {
  constructor({upload,resolveUrl}){this.upload=upload;this.resolveUrl=resolveUrl;}
  async uploadImage(file,{workId='draft'}={}){
    validateImageFile(file);
    const safeName=String(file.name||'image').replace(/[^a-zA-Z0-9._-]+/g,'-');
    const assetId=crypto.randomUUID();
    const storagePath=`${workId}/${assetId}-${safeName}`;
    const uploaded=await this.upload(storagePath,file);
    const persistedPath=uploaded?.storagePath||storagePath;
    return {assetId,storagePath:persistedPath,url:uploaded?.url||this.resolveUrl(persistedPath),name:file.name||'Изображение'};
  }
}
