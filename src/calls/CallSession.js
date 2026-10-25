export const CALL_STATUS_LABELS=Object.freeze({calling:'Звоним',incoming:'Входящий звонок',connecting:'Соединение',connected:'Подключено',disconnected:'Нет соединения',failed:'Нет соединения',ended:'Завершён'});

/** One call owns its peer, media, ordered signalling and all connection timers. */
export class CallSession {
  constructor({mode='audio',initiator=false,iceServers=[],iceTransportPolicy='all',sendSignal,onStatus=()=>{},onRemote=()=>{},onLocal=()=>{},onFailure=()=>{},debug=false,logger=(...args)=>console.debug(...args),PeerConnection=globalThis.RTCPeerConnection,mediaDevices=globalThis.navigator?.mediaDevices,createStream=()=>new globalThis.MediaStream(),connectionTimeout=30000,disconnectTimeout=8000,timers=globalThis}={}){
    Object.assign(this,{mode,initiator,iceServers,iceTransportPolicy,sendSignal,onStatus,onRemote,onLocal,onFailure,debug,logger,PeerConnection,mediaDevices,createStream,connectionTimeout,disconnectTimeout,timers});
    this.pendingIce=[];this.closed=false;this.signalQueue=Promise.resolve();this.status=initiator?'calling':'incoming';this.remoteStream=null;
  }
  setStatus(status,detail=''){
    this.status=status;this.onStatus(status,CALL_STATUS_LABELS[status]||status,detail);
    this.diagnostic('state',{status});
  }
  diagnostic(event,details={}){
    if(this.debug)this.logger('[FRAKTUM WebRTC]',{event,connectionState:this.pc?.connectionState||null,iceConnectionState:this.pc?.iceConnectionState||null,iceGatheringState:this.pc?.iceGatheringState||null,signalingState:this.pc?.signalingState||null,...details});
  }
  assertOpen(){if(this.closed)throw new Error('Звонок уже завершён');}
  async open(){
    if(!this.PeerConnection||!this.mediaDevices?.getUserMedia)throw new Error('Браузер не поддерживает звонки или не предоставлен безопасный HTTPS-контекст');
    this.setStatus(this.initiator?'calling':'connecting');
    this.connectTimer=this.timers.setTimeout(()=>this.fail(new Error('Время подключения истекло. Проверьте сеть и доступность TURN-сервера.')),this.connectionTimeout);
    try{
      this.remoteStream=this.createStream();
      const stream=await this.mediaDevices.getUserMedia({audio:true,video:this.mode==='video'});
      if(this.closed){stream.getTracks().forEach(track=>track.stop());this.assertOpen();}
      this.localStream=stream;
      this.pc=new this.PeerConnection({iceServers:this.iceServers,iceTransportPolicy:this.iceTransportPolicy});
      const pc=this.pc;
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      pc.addEventListener('track',event=>{
        if(this.closed)return;
        const tracks=event.streams?.[0]?.getTracks()||(event.track?[event.track]:[]);
        tracks.forEach(track=>{if(!this.remoteStream.getTracks().some(existing=>existing.id===track.id))this.remoteStream.addTrack(track);});
        this.onRemote(this.remoteStream);
      });
      pc.addEventListener('icecandidate',event=>{
        if(!event.candidate||this.closed)return;
        this.diagnostic('icecandidate',{candidateType:event.candidate.type||'unknown'});
        Promise.resolve().then(()=>this.sendSignal('ice',event.candidate.toJSON())).catch(error=>this.fail(error,'Не удалось отправить сетевые параметры звонка'));
      });
      for(const event of ['iceconnectionstatechange','icegatheringstatechange','signalingstatechange','connectionstatechange'])pc.addEventListener(event,()=>{
        if(this.closed)return;
        this.diagnostic(event);
        if(pc.connectionState==='connected'){
          this.timers.clearTimeout(this.connectTimer);this.timers.clearTimeout(this.disconnectTimer);this.disconnectTimer=null;this.setStatus('connected');
        }else if(pc.connectionState==='failed'||pc.iceConnectionState==='failed')this.fail(new Error('Не удалось установить media connection. Проверьте сеть и TURN-сервер.'));
        else if(pc.connectionState==='disconnected'){
          this.setStatus('disconnected');
          if(!this.disconnectTimer)this.disconnectTimer=this.timers.setTimeout(()=>this.fail(new Error('Соединение с собеседником потеряно')),this.disconnectTimeout);
        }else if(pc.connectionState==='connecting')this.setStatus('connecting');
      });
      pc.addEventListener('icecandidateerror',event=>this.diagnostic('icecandidateerror',{code:event.errorCode||null}));
      this.onLocal(stream);
      if(this.debug)this.statsTimer=this.timers.setInterval(()=>this.collectStats(),2000);
      if(this.initiator){
        const offer=await pc.createOffer();this.assertOpen();await pc.setLocalDescription(offer);this.assertOpen();
        await this.sendSignal('offer',{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
      }
      this.assertOpen();return this;
    }catch(error){this.dispose();throw error;}
  }
  receive(type,payload){
    const operation=this.signalQueue.then(()=>this.applySignal(type,payload));
    // Preserve rejection for the poller while allowing an explicit retry in order.
    this.signalQueue=operation.catch(()=>{});
    return operation;
  }
  async applySignal(type,payload){
    this.assertOpen();
    const pc=this.pc;if(!pc)throw new Error('Media connection ещё не инициализирован');
    if(!['offer','answer','ice'].includes(type))throw new Error('Неизвестный тип параметров звонка');
    if(type==='ice'){
      if(pc.remoteDescription)await pc.addIceCandidate(payload);else this.pendingIce.push(payload);
      return;
    }
    if((type==='offer'&&!this.initiator)||(type==='answer'&&this.initiator)){
      if(pc.remoteDescription?.sdp===payload?.sdp&&pc.remoteDescription?.type===payload?.type)return;
      await pc.setRemoteDescription(payload);this.assertOpen();
      for(const candidate of this.pendingIce.splice(0)){await pc.addIceCandidate(candidate);this.assertOpen();}
      this.setStatus('connecting');
      if(type==='offer'){
        const answer=await pc.createAnswer();this.assertOpen();await pc.setLocalDescription(answer);this.assertOpen();
        await this.sendSignal('answer',{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
      }
    }
  }
  toggleTrack(kind){
    this.assertOpen();const tracks=this.localStream?.getTracks().filter(track=>track.kind===kind)||[];
    if(!tracks.length)throw new Error(kind==='video'?'Камера недоступна':'Микрофон недоступен');
    const enabled=!tracks.some(track=>track.enabled);tracks.forEach(track=>track.enabled=enabled);return enabled;
  }
  async canSwitchCamera(){return this.mode==='video'&&!!this.mediaDevices?.enumerateDevices&&(await this.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput').length>1;}
  async switchCamera(){
    this.assertOpen();
    const devices=(await this.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
    if(devices.length<2)throw new Error('Вторая камера недоступна');
    const current=this.localStream.getVideoTracks()[0],currentId=current?.getSettings?.().deviceId;
    const index=devices.findIndex(device=>device.deviceId===currentId),next=devices[(index+1)%devices.length];
    const replacement=await this.mediaDevices.getUserMedia({audio:false,video:{deviceId:{exact:next.deviceId}}});
    try{
      this.assertOpen();const track=replacement.getVideoTracks()[0];if(!track)throw new Error('Новая камера не вернула видеодорожку');
      const sender=this.pc.getSenders().find(item=>item.track?.kind==='video');if(!sender)throw new Error('Видеодорожка звонка недоступна');
      track.enabled=current?.enabled!==false;await sender.replaceTrack(track);this.assertOpen();
      if(current){this.localStream.removeTrack(current);current.stop();}
      this.localStream.addTrack(track);this.onLocal(this.localStream);return track;
    }catch(error){replacement.getTracks().forEach(track=>track.stop());throw error;}
  }
  async collectStats(){
    if(!this.debug||this.closed||!this.pc)return;
    try{
      const stats=await this.pc.getStats();let pair=null;
      stats.forEach(report=>{if(report.type==='transport'&&report.selectedCandidatePairId)pair=stats.get(report.selectedCandidatePairId)||pair;});
      if(!pair)stats.forEach(report=>{if(report.type==='candidate-pair'&&report.state==='succeeded'&&report.nominated)pair=report;});
      if(pair)this.diagnostic('stats',{localType:stats.get(pair.localCandidateId)?.candidateType||null,remoteType:stats.get(pair.remoteCandidateId)?.candidateType||null,protocol:stats.get(pair.localCandidateId)?.protocol||null,roundTripTime:pair.currentRoundTripTime??null,bytesSent:pair.bytesSent||0,bytesReceived:pair.bytesReceived||0});
    }catch(error){this.diagnostic('stats-error',{name:error?.name||'Error'});}
  }
  fail(error,message=error?.message||'Не удалось установить звонок'){
    if(this.closed)return;
    this.diagnostic('failure',{name:error?.name||'Error'});this.setStatus('failed',message);this.dispose();this.onFailure(message);
  }
  dispose(){
    if(this.closed)return;this.closed=true;
    this.timers.clearTimeout(this.connectTimer);this.timers.clearTimeout(this.disconnectTimer);this.timers.clearInterval(this.statsTimer);
    this.localStream?.getTracks().forEach(track=>track.stop());this.remoteStream?.getTracks().forEach(track=>track.stop());this.pc?.close();this.pendingIce=[];
  }
  close(){if(!this.closed)this.setStatus('ended');this.dispose();}
}
