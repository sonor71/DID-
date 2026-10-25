import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

function executable(){
 if(process.env.TEST_TURN_SERVER_BIN)return process.env.TEST_TURN_SERVER_BIN;
 return (process.env.PATH||'').split(path.delimiter).map(directory=>path.join(directory,'turnserver')).find(filename=>{try{fs.accessSync(filename,fs.constants.X_OK);return true;}catch{return false;}});
}
async function unusedPort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function canConnect(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});}

/** A real coturn relay, loopback-only, with ephemeral test credentials. Never touches a shared service. */
export async function localTurnServer(){
 const binary=executable();if(!binary)return null;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fraktum-call-turn-')),port=await unusedPort();
 const username='regression',credential=randomUUID();
 const configuration=path.join(directory,'turnserver.conf');
 fs.writeFileSync(configuration,`listening-ip=127.0.0.1\nrelay-ip=127.0.0.1\nlistening-port=${port}\nrealm=fraktum-regression.invalid\nlt-cred-mech\nuser=${username}:${credential}\nallow-loopback-peers\nno-tls\nno-dtls\nno-cli\nno-udp\nrelay-threads=1\npidfile=${directory}/turn.pid\nlog-file=${directory}/turn.log\n`,{mode:0o600});
 const child=spawn(binary,['-c',configuration],{cwd:directory,stdio:'ignore'});
 let launchError=null,exited=false;child.once('error',error=>{launchError=error;});child.once('exit',()=>{exited=true;});
 const stop=async()=>{
  if(!exited&&!launchError){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}
  fs.rmSync(directory,{recursive:true,force:true});
 };
 try{
  for(let attempt=0;attempt<60;attempt++){
   if(launchError)throw launchError;if(exited)throw new Error('Local coturn exited before readiness');
   if(await canConnect(port))return {runtime:{VITE_TURN_URL:`turn:127.0.0.1:${port}?transport=tcp`,VITE_TURN_USERNAME:username,VITE_TURN_CREDENTIAL:credential},stop};
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Local coturn did not open its TCP listener');
 }catch(error){await stop();throw error;}
}
