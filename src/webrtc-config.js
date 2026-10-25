/** Build ICE configuration explicitly; never replace the browser's global peer class. */
export function buildIceServers(runtime=globalThis.__FRAKTUM_CONFIG__||{}){
  const servers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
  const urls=String(runtime.VITE_TURN_URL||'').split(',').map(value=>value.trim()).filter(Boolean);
  const username=String(runtime.VITE_TURN_USERNAME||'').trim();
  const credential=String(runtime.VITE_TURN_CREDENTIAL||'').trim();
  if(urls.length||username||credential){
    if(!urls.length||!username||!credential)throw new TypeError('Для TURN нужны VITE_TURN_URL, VITE_TURN_USERNAME и VITE_TURN_CREDENTIAL');
    if(urls.some(url=>!/^turns?:(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/.test(url)))throw new TypeError('VITE_TURN_URL должен содержать TURN/TURNS URI без встроенных учётных данных');
    servers.push({urls,username,credential});
  }
  return servers;
}
