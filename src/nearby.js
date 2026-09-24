const listeners=new Set();
const state={available:false,plugin:null,devices:new Map(),connected:new Set(),status:'idle',displayName:'FRAKTUM'};

function emit(type,payload={}){for(const fn of listeners)try{fn({type,payload,state:snapshot()})}catch{}}
function snapshot(){return {available:state.available,status:state.status,displayName:state.displayName,devices:[...state.devices.values()],connected:[...state.connected]}}
function findPlugin(){return globalThis.Capacitor?.Plugins?.OfflineChat||globalThis.OfflineChat||null}
async function bindEvents(plugin){const names=['deviceFound','deviceLost','connectionInitiated','connectionResult','message','disconnected','status'];for(const name of names){try{await plugin.addListener?.(name,data=>{if(name==='deviceFound'&&data?.endpointId)state.devices.set(data.endpointId,data);if(name==='deviceLost'&&data?.endpointId)state.devices.delete(data.endpointId);if(name==='connectionResult'&&data?.endpointId&&String(data.status||'').toLowerCase().includes('connected'))state.connected.add(data.endpointId);if(name==='disconnected'&&data?.endpointId)state.connected.delete(data.endpointId);if(name==='status')state.status=data?.status||data?.message||'active';emit(name,data)})}catch{}}}
export async function initNearby(){const p=findPlugin();state.plugin=p;state.available=!!p;if(p)await bindEvents(p);emit('init');return snapshot()}
export function onNearby(fn){listeners.add(fn);return()=>listeners.delete(fn)}
export function getNearbyState(){return snapshot()}
export async function requestNearbyPermissions(){if(!state.plugin)throw new Error('FRAKTUM Link доступен в нативной Android-сборке');await state.plugin.checkPermissions?.();return state.plugin.requestPermissions?.()}
export async function startNearby(name='FRAKTUM'){if(!state.plugin)throw new Error('FRAKTUM Link доступен в нативной Android-сборке');state.displayName=name;await state.plugin.setDisplayName?.({name});await requestNearbyPermissions();await state.plugin.startAdvertising?.();await state.plugin.startDiscovery?.();state.status='scanning';emit('status',{status:'scanning'});return snapshot()}
export async function stopNearby(){await state.plugin?.stopAll?.();state.status='idle';emit('status',{status:'idle'})}
export async function connectNearby(endpointId){if(!state.plugin)throw new Error('Нативный модуль не найден');return state.plugin.requestConnection?.({endpointId})}
export async function acceptNearby(endpointId){return state.plugin?.acceptConnection?.({endpointId})}
export async function rejectNearby(endpointId){return state.plugin?.rejectConnection?.({endpointId})}
export async function disconnectNearby(endpointId){return state.plugin?.disconnect?.({endpointId})}
export async function sendNearbyMessage(text){if(!state.plugin)throw new Error('Нативный модуль не найден');return state.plugin.sendMessage?.({text:String(text||'')})}
