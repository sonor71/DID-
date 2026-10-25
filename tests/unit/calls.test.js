import test from 'node:test';
import assert from 'node:assert/strict';
import {CallSession} from '../../src/calls/CallSession.js';
import {buildIceServers} from '../../src/webrtc-config.js';
import {createRuntimeConfig} from '../../scripts/runtime-config.mjs';

class Track {constructor(kind,id=kind){this.kind=kind;this.id=id;this.enabled=true;this.stopped=false;}stop(){this.stopped=true;}getSettings(){return {deviceId:this.id};}}
class Stream {constructor(tracks=[]){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}addTrack(track){this.tracks.push(track);}removeTrack(track){this.tracks=this.tracks.filter(t=>t!==track);}}
class Peer extends globalThis.EventTarget {
 constructor(config){super();this.config=config;this.connectionState='new';this.iceConnectionState='new';this.signalingState='stable';this.senders=[];this.candidates=[];}
 addTrack(track){this.senders.push({track,async replaceTrack(next){this.track=next;}});}
 getSenders(){return this.senders;}
 async createOffer(){return {type:'offer',sdp:'fixture-offer'};}
 async createAnswer(){return {type:'answer',sdp:'fixture-answer'};}
 async setLocalDescription(value){this.localDescription=value;}
 async setRemoteDescription(value){this.remoteDescription=value;}
 async addIceCandidate(candidate){assert.ok(this.remoteDescription,'ICE must follow remote description');this.candidates.push(candidate);}
 close(){this.closed=true;}
}
function fixture(options={}){
 const signals=[],statuses=[],failures=[],tracks=[new Track('audio')];if(options.mode==='video')tracks.push(new Track('video','front'));
 const timers={next:0,timeouts:new Map(),intervals:new Map(),setTimeout(fn){const id=++this.next;this.timeouts.set(id,fn);return id;},clearTimeout(id){this.timeouts.delete(id);},setInterval(fn){const id=++this.next;this.intervals.set(id,fn);return id;},clearInterval(id){this.intervals.delete(id);}};
 const mediaDevices={getUserMedia:async()=>new Stream(tracks),enumerateDevices:async()=>[{kind:'videoinput',deviceId:'front'},{kind:'videoinput',deviceId:'back'}]};
 const session=new CallSession({PeerConnection:Peer,createStream:()=>new Stream(),mediaDevices,timers,sendSignal:async(type,payload)=>signals.push({type,payload}),onStatus:(status)=>statuses.push(status),onFailure:message=>failures.push(message),...options});
 return {session,signals,statuses,failures,tracks,timers,mediaDevices};
}
test('TURN is optional, explicitly configured and refuses partial or embedded credentials',()=>{
 assert.equal(buildIceServers({}).length,2);
 const servers=buildIceServers({VITE_TURN_URL:'turn:relay.example:3478, turns:relay.example:443?transport=tcp',VITE_TURN_USERNAME:'ephemeral',VITE_TURN_CREDENTIAL:'fixture'});
 assert.equal(servers.length,3);assert.deepEqual(servers[2].urls,['turn:relay.example:3478','turns:relay.example:443?transport=tcp']);
 assert.throws(()=>buildIceServers({VITE_TURN_URL:'turn:relay.example'}),/Для TURN/);
 assert.throws(()=>buildIceServers({VITE_TURN_URL:'https://user:pass@relay.example',VITE_TURN_USERNAME:'fixture',VITE_TURN_CREDENTIAL:'fixture'}),/TURN\/TURNS/);
 const runtime=createRuntimeConfig({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',VITE_TURN_URL:'turn:relay.example:3478',VITE_TURN_USERNAME:'fixture',VITE_TURN_CREDENTIAL:'fixture',VITE_CALL_DEBUG:'TRUE'});
 assert.equal(runtime.VITE_CALL_DEBUG,'true');assert.equal(buildIceServers(runtime).length,3);
});
test('caller sends offer and callee queues early ICE until remote description; duplicates do not answer twice',async()=>{
 const caller=fixture({initiator:true}),callee=fixture();await caller.session.open();await callee.session.open();
 assert.equal(caller.signals[0].type,'offer');
 await callee.session.receive('ice',{candidate:'early-fixture'});assert.equal(callee.session.pc.candidates.length,0);
 await callee.session.receive('offer',caller.signals[0].payload);assert.equal(callee.session.pc.candidates.length,1);assert.equal(callee.signals[0].type,'answer');
 await callee.session.receive('offer',caller.signals[0].payload);assert.equal(callee.signals.length,1);
 await caller.session.receive('answer',callee.signals[0].payload);assert.equal(caller.session.pc.remoteDescription.type,'answer');
 caller.session.close();callee.session.close();assert.equal(caller.timers.timeouts.size,0);assert.ok(caller.tracks.every(track=>track.stopped));
});
test('timeout and connection failure close all media and provide actionable status once',async()=>{
 const context=fixture();await context.session.open();[...context.timers.timeouts.values()][0]();
 assert.equal(context.session.status,'failed');assert.match(context.failures[0],/TURN/);assert.ok(context.session.pc.closed);assert.ok(context.tracks[0].stopped);assert.equal(context.timers.timeouts.size,0);
 context.session.fail(new Error('again'));assert.equal(context.failures.length,1);
});
test('connected clears deadline, temporary disconnection can recover and repeated calls have fresh peers',async()=>{
 const first=fixture();await first.session.open();first.session.pc.connectionState='connected';first.session.pc.dispatchEvent(new globalThis.Event('connectionstatechange'));assert.equal(first.timers.timeouts.size,0);
 first.session.pc.connectionState='disconnected';first.session.pc.dispatchEvent(new globalThis.Event('iceconnectionstatechange'));assert.equal(first.session.status,'disconnected');assert.equal(first.timers.timeouts.size,1);
 first.session.pc.connectionState='connected';first.session.pc.dispatchEvent(new globalThis.Event('connectionstatechange'));assert.equal(first.timers.timeouts.size,0);first.session.close();
 const second=fixture();await second.session.open();assert.notEqual(first.session.pc,second.session.pc);assert.equal(second.session.pendingIce.length,0);second.session.close();
});
test('mute/camera toggle and camera replacement update actual tracks and preserve disabled state',async()=>{
 const context=fixture({mode:'video'});await context.session.open();assert.equal(context.session.toggleTrack('audio'),false);assert.equal(context.tracks[0].enabled,false);assert.equal(context.session.toggleTrack('audio'),true);
 assert.equal(context.session.toggleTrack('video'),false);assert.equal(await context.session.canSwitchCamera(),true);
 const back=new Track('video','back');context.mediaDevices.getUserMedia=async()=>new Stream([back]);await context.session.switchCamera();
 assert.equal(back.enabled,false);assert.equal(context.session.localStream.getVideoTracks()[0],back);assert.equal(context.session.pc.getSenders().find(sender=>sender.track.kind==='video').track,back);
 context.session.close();assert.ok(back.stopped);
});
test('permission or peer setup failures release media and late permission results after hangup are stopped',async()=>{
 const context=fixture({PeerConnection:class {constructor(){throw new Error('Peer unavailable');}}});await assert.rejects(context.session.open(),/Peer unavailable/);assert.ok(context.tracks[0].stopped);assert.equal(context.timers.timeouts.size,0);
 let resolve;const late=fixture({mediaDevices:{getUserMedia:()=>new Promise(done=>resolve=done)}});const opening=late.session.open();late.session.close();const track=new Track('audio');resolve(new Stream([track]));await assert.rejects(opening,/завершён/);assert.ok(track.stopped);
});
test('debug diagnostics omit SDP, candidate addresses, URLs and credentials',async()=>{
 const output=[],context=fixture({debug:true,logger:(...args)=>output.push(args)});await context.session.open();
 context.session.pc.getStats=async()=>new Map([['pair',{type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'local',remoteCandidateId:'remote',currentRoundTripTime:.1,bytesSent:4}],['local',{candidateType:'relay',protocol:'udp',address:'PRIVATE_ADDRESS',url:'turn:SECRET'}],['remote',{candidateType:'host',address:'PRIVATE_ADDRESS'}]]);
 await context.session.collectStats();const text=JSON.stringify(output);assert.match(text,/relay/);assert.doesNotMatch(text,/PRIVATE_ADDRESS|SECRET|fixture-offer|credential/);context.session.close();assert.equal(context.timers.intervals.size,0);
});
