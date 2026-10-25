import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {buildIceServers} from '../../src/webrtc-config.js';
import {localTurnServer} from '../fixtures/local-turn.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const turnEnvironment={VITE_TURN_URL:process.env.TEST_TURN_URL||'',VITE_TURN_USERNAME:process.env.TEST_TURN_USERNAME||'',VITE_TURN_CREDENTIAL:process.env.TEST_TURN_CREDENTIAL||''};


test('two independent Chromium browsers establish audio/video in both directions and release repeated calls', {timeout:90000}, async()=>{
 const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){response.setHeader('content-type','text/html');response.end('<!doctype html><html><title>Call transport regression</title></html>');return;}
  if(pathname!=='/src/calls/CallSession.js'){response.writeHead(404);response.end();return;}
  response.setHeader('content-type','text/javascript');response.end(fs.readFileSync(path.join(root,pathname)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=`http://127.0.0.1:${server.address().port}`;
 const browsers=[],pages=[];let relay=null;
 try{
  relay=turnEnvironment.VITE_TURN_URL?null:await localTurnServer();
  const iceServers=turnEnvironment.VITE_TURN_URL?buildIceServers(turnEnvironment):(relay?buildIceServers(relay.runtime):[]);
  for(let index=0;index<2;index++){
   const browser=await chromium.launch({executablePath,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--no-sandbox']});browsers.push(browser);
   const page=await browser.newPage();pages.push(page);await page.goto(address);
  }
  for(let index=0;index<2;index++)await pages[index].exposeFunction('sendCallSignal',async({round,type,payload})=>{
   const recipient=pages[1-index];
   await recipient.evaluate(async({round,type,payload})=>{if(globalThis.callRound===round)await globalThis.call.receive(type,payload);},{round,type,payload});
  });
  for(const [round,mode,caller] of [[1,'audio',0],[2,'audio',1],[3,'video',0],[4,'video',1]]){
   for(let index=0;index<2;index++)await pages[index].evaluate(async({round,mode,initiator,iceServers})=>{
    const {CallSession}=await import('/src/calls/CallSession.js');
    globalThis.callRound=round;globalThis.callFailures=[];globalThis.callDiagnostics=[];
    globalThis.call=new CallSession({mode,initiator,iceServers,iceTransportPolicy:iceServers.length?'relay':'all',debug:true,logger:(...args)=>globalThis.callDiagnostics.push(args),sendSignal:(type,payload)=>globalThis.sendCallSignal({round,type,payload}),onFailure:message=>globalThis.callFailures.push(message)});
   },{round,mode,initiator:index===caller,iceServers});
   await pages[1-caller].evaluate(()=>globalThis.call.open().then(()=>null));
   await pages[caller].evaluate(()=>globalThis.call.open().then(()=>null));
   for(const page of pages){
    try{await page.waitForFunction(()=>globalThis.call.status==='connected',{},{timeout:12000});}catch(error){const detail=await page.evaluate(()=>({status:globalThis.call.status,connection:globalThis.call.pc.connectionState,ice:globalThis.call.pc.iceConnectionState,signaling:globalThis.call.pc.signalingState,failures:globalThis.callFailures,diagnostics:globalThis.callDiagnostics}));throw new Error(`Native media round ${round}: ${JSON.stringify(detail)}. Check browser network policy and a usable TCP TURN service (TEST_TURN_URL/USERNAME/CREDENTIAL).`,{cause:error});}
    await page.waitForFunction(async kinds=>{
     const stats=await globalThis.call.pc.getStats(),received=new Set(),sent=new Set();
     stats.forEach(report=>{if(report.type==='inbound-rtp'&&report.bytesReceived>0)received.add(report.kind||report.mediaType);if(report.type==='outbound-rtp'&&report.bytesSent>0)sent.add(report.kind||report.mediaType);});
     return kinds.every(kind=>received.has(kind)&&sent.has(kind));
    },mode==='video'?['audio','video']:['audio'],{timeout:12000});
    const result=await page.evaluate(()=>({tracks:globalThis.call.remoteStream.getTracks().map(track=>track.kind).sort(),failures:globalThis.callFailures}));
    assert.deepEqual(result.tracks,mode==='video'?['audio','video']:['audio']);assert.deepEqual(result.failures,[]);
    if(iceServers.length){await page.evaluate(()=>globalThis.call.collectStats());const relayed=await page.evaluate(()=>globalThis.callDiagnostics.some(([,event])=>event.event==='stats'&&event.localType==='relay'&&event.remoteType==='relay'));assert.equal(relayed,true,'Both peers must select real relay candidates');}
    assert.equal(await page.evaluate(()=>globalThis.call.toggleTrack('audio')),false);
    assert.equal(await page.evaluate(()=>globalThis.call.toggleTrack('audio')),true);
    if(mode==='video'){
     assert.equal(await page.evaluate(()=>globalThis.call.toggleTrack('video')),false);
     assert.equal(await page.evaluate(()=>globalThis.call.toggleTrack('video')),true);
    }
   }
   for(const page of pages){
    const stopped=await page.evaluate(()=>{const tracks=globalThis.call.localStream.getTracks();globalThis.call.close();return {closed:globalThis.call.pc.connectionState,tracks:tracks.map(track=>track.readyState),status:globalThis.call.status};});
    assert.equal(stopped.closed,'closed');assert.equal(stopped.status,'ended');assert.ok(stopped.tracks.every(state=>state==='ended'));
   }
  }
 }finally{
  await Promise.allSettled(browsers.map(browser=>browser.close()));
  await new Promise(resolve=>server.close(resolve));
  await relay?.stop();
 }
});
