const CACHE='montenegro-shell-v3';
const BASE=new URL('./',self.location.href);
const INDEX=new URL('index.html',BASE).href;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([new Request(BASE.href,{cache:'reload'}),new Request(INDEX,{cache:'reload'})])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('montenegro-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||event.request.mode!=='navigate'||![BASE.pathname,new URL(INDEX).pathname].includes(url.pathname))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Unavailable');
      const cache=await caches.open(CACHE);await cache.put(INDEX,response.clone());return response;
    }catch(e){return (await caches.match(INDEX))||Response.error();}
  })());
});

let checkingUpdate=false;
self.addEventListener('message',event=>{
  if(event.data?.type!=='CHECK_APP_UPDATE'||checkingUpdate)return;
  checkingUpdate=true;
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      const previous=await cache.match(INDEX);
      const response=await fetch(INDEX,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)return;
      const changed=previous && await previous.text()!==await response.clone().text();
      await cache.put(INDEX,response);
      if(changed)event.source?.postMessage({type:'APP_UPDATED'});
    }catch(e){
      // Keep the saved itinerary available without connectivity.
    }finally{checkingUpdate=false;}
  })());
});
