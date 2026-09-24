import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const parts = [
  'chunk_00',
  'fix_01_0', 'fix_01_1', 'fix_01_2', 'fix_01_3',
  'chunk_02',
  'chunk_03', 'fix_03_tail_0', 'fix_03_tail_1',
  'chunk_04', 'chunk_05', 'chunk_06'
];

let encoded = '';
for (const part of parts) {
  encoded += (await readFile(new URL(`./payload/${part}`, import.meta.url), 'utf8')).trim();
}

if (encoded.length !== 115240) throw new Error(`FRAKTUM bundle is incomplete: ${encoded.length}/115240 base64 bytes`);
const archive = Buffer.from(encoded, 'base64');
const digest = createHash('sha256').update(archive).digest('hex');
if (archive.length !== 86430 || digest !== '9f99bab6f10593d3ad65244d531cf14907836ad18c7858f523073717885fb038') throw new Error(`FRAKTUM bundle checksum mismatch: ${archive.length} bytes, ${digest}`);

const unpack = new URL('./.bundle/', import.meta.url);
const out = new URL('./dist/', import.meta.url);
await rm(unpack, { recursive: true, force: true });
await rm(out, { recursive: true, force: true });
await mkdir(unpack, { recursive: true });
new AdmZip(archive).extractAllTo(fileURLToPath(unpack), true);
const bundledDist = new URL('./.bundle/fraktum-messenger-v0.2.3/dist/', import.meta.url);
await cp(bundledDist, out, { recursive: true });

async function replaceChecked(url, from, to, label) {
  let text = await readFile(url, 'utf8');
  if (!text.includes(from)) throw new Error(`Patch target not found: ${label}`);
  text = text.replace(from, to);
  await writeFile(url, text);
}

const appPath = new URL('./dist/src/app.js', import.meta.url);
const apiPath = new URL('./dist/src/api.js', import.meta.url);
const indexPath = new URL('./dist/index.html', import.meta.url);

await replaceChecked(appPath, "function bundleSignature(b){if(!b)return '';return JSON.stringify({m:(b.messages||[]).map(m=>[m.id,m.body,m.reply_to,m.edited_at,m.transport,m.message_type,m.is_important,JSON.stringify(m.metadata||{})]),a:(b.attachments||[]).map(a=>[a.id,a.message_id,a.storage_path,a.mime_type,a.size_bytes]),r:(b.reactions||[]).map(r=>[r.message_id,r.user_id,r.reaction]),c:(b.receipts||[]).map(r=>[r.message_id,r.user_id,r.delivered_at,r.read_at]),p:(b.projectItems||[]).map(x=>[x.id,x.message_id,x.item_type,x.body])})}\nasync function loadSelected(full=false){if(!state.selectedId){state.bundle=null;state.bundleSig='';return}const b=await fetchConversationBundle(state.selectedId);const nextSig=bundleSignature(b);const changed=nextSig!==state.bundleSig;state.bundle=b;state.bundleSig=nextSig;await markDelivered(b.messages).catch(()=>{});if(document.visibilityState==='visible')await markRead(b.messages).catch(()=>{});if(full)return;renderChatHeader();if(changed)renderMessages();renderRightPanel()}", "function bundleSignature(b){if(!b)return '';return JSON.stringify({m:(b.messages||[]).map(m=>[m.id,m.body,m.reply_to,m.edited_at,m.transport,m.message_type,m.is_important,JSON.stringify(m.metadata||{})]),a:(b.attachments||[]).map(a=>[a.id,a.message_id,a.storage_path,a.mime_type,a.size_bytes,a.url]),r:(b.reactions||[]).map(r=>[r.message_id,r.user_id,r.reaction]),p:(b.projectItems||[]).map(x=>[x.id,x.message_id,x.item_type,x.body])})}\nfunction renderReceiptStates(){const c=currentConversation(),b=state.bundle;if(!c||!b)return;for(const m of b.messages||[]){if(!m.mine)continue;const article=document.querySelector(`[data-message=\\\"${m.id}\\\"]`);const el=article?.querySelector('.checks');if(!el)continue;const receipt=messageReceipt(m,c,b.receipts);el.textContent=receipt.symbol;el.title=receipt.label}}\nasync function loadSelected(full=false){if(!state.selectedId){state.bundle=null;state.bundleSig='';return}const b=await fetchConversationBundle(state.selectedId);const nextSig=bundleSignature(b);const changed=nextSig!==state.bundleSig;state.bundle=b;state.bundleSig=nextSig;await markDelivered(b.messages,b.receipts).catch(()=>{});if(document.visibilityState==='visible')await markRead(b.messages,b.receipts).catch(()=>{});if(full)return;renderChatHeader();if(changed)renderMessages();else renderReceiptStates();renderRightPanel()}", 'message render / receipt polling');
await replaceChecked(appPath, "document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.bundle)markRead(state.bundle.messages).then(()=>loadSelected(false)).catch(()=>{})});", "document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.bundle)markRead(state.bundle.messages,state.bundle.receipts).then(()=>loadSelected(false)).catch(()=>{})});", 'visibility receipt update');
await replaceChecked(apiPath, "export async function markDelivered(messages){const me=getUserId();const rows=(messages||[]).filter(m=>m.sender_id!==me).map(m=>({message_id:m.id,user_id:me,delivered_at:new Date().toISOString()}));if(!rows.length)return;await rest('lit_message_receipts?on_conflict=message_id,user_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}\nexport async function markRead(messages){const me=getUserId();const now=new Date().toISOString();const rows=(messages||[]).filter(m=>m.sender_id!==me).map(m=>({message_id:m.id,user_id:me,delivered_at:now,read_at:now}));if(!rows.length)return;await rest('lit_message_receipts?on_conflict=message_id,user_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}", "export async function markDelivered(messages,receipts=[]){const me=getUserId();const current=new Map((receipts||[]).filter(r=>r.user_id===me).map(r=>[r.message_id,r]));const now=new Date().toISOString();const rows=(messages||[]).filter(m=>m.sender_id!==me&&!current.get(m.id)?.delivered_at).map(m=>({message_id:m.id,user_id:me,delivered_at:now}));if(!rows.length)return;await rest('lit_message_receipts?on_conflict=message_id,user_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}\nexport async function markRead(messages,receipts=[]){const me=getUserId();const current=new Map((receipts||[]).filter(r=>r.user_id===me).map(r=>[r.message_id,r]));const now=new Date().toISOString();const rows=(messages||[]).filter(m=>m.sender_id!==me&&!current.get(m.id)?.read_at).map(m=>({message_id:m.id,user_id:me,delivered_at:current.get(m.id)?.delivered_at||now,read_at:now}));if(!rows.length)return;await rest('lit_message_receipts?on_conflict=message_id,user_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}", 'receipt write deduplication');
let index = await readFile(indexPath, 'utf8');
index = index.replaceAll('0.2.3', '0.2.4');
await writeFile(indexPath, index);

console.log(`Built FRAKTUM Messenger v0.2.4 -> dist/ (photo polling fix)`);
